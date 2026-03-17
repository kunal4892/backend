/******************************************************************************************
 * 🚦 Rate Limiting Middleware
 *
 * Provides production-ready rate limiting with:
 *  ✅ In-memory store (suitable for Supabase Edge Functions)
 *  ✅ Sliding window algorithm
 *  ✅ Configurable limits per endpoint
 *  ✅ IP-based and user-based rate limiting
 *  ✅ Rate limit headers (X-RateLimit-*)
 *  ✅ Automatic cleanup of expired entries
 ******************************************************************************************/

import { Logger } from "./logger.ts";

// Rate limit configuration
export interface RateLimitConfig {
  // Maximum number of requests allowed in the window
  maxRequests: number;
  // Time window in milliseconds
  windowMs: number;
  // Key generator function (defaults to IP-based)
  keyGenerator?: (req: Request) => string;
  // Skip rate limiting for certain requests
  skip?: (req: Request) => boolean;
  // Custom error message
  message?: string;
  // Enable rate limit headers in response
  headers?: boolean;
}

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,        // 60 requests
  windowMs: 60 * 1000,    // per 1 minute
  headers: true,
  message: "Rate limit exceeded. Please try again later.",
};

// Store entry for a rate limit key
interface RateLimitEntry {
  // Array of timestamps for requests in the current window
  requests: number[];
  // When this entry was first created
  createdAt: number;
}

// In-memory store for rate limiting
// Note: In Supabase Edge Functions, this is ephemeral (per-instance)
// For production with multiple instances, consider Upstash Redis
class RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: number | null = null;
  
  constructor() {
    // Start cleanup interval (every 5 minutes)
    this.startCleanup();
  }
  
  // Get or create entry for a key
  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }
  
  // Set entry for a key
  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }
  
  // Increment request count for a key
  increment(key: string, now: number): { count: number; resetTime: number } {
    let entry = this.store.get(key);
    
    if (!entry) {
      entry = {
        requests: [],
        createdAt: now,
      };
    }
    
    // Add current request timestamp
    entry.requests.push(now);
    
    this.store.set(key, entry);
    
    // Calculate reset time (oldest request + window)
    const resetTime = entry.requests.length > 0 
      ? Math.max(...entry.requests) + (entry.requests.length > 0 ? 60000 : 0) // approximate
      : now + 60000;
    
    return { count: entry.requests.length, resetTime };
  }
  
  // Clean up expired entries
  cleanup(windowMs: number): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      // Filter out requests outside the window
      const validRequests = entry.requests.filter(ts => now - ts < windowMs);
      
      if (validRequests.length === 0) {
        // Remove empty entries
        this.store.delete(key);
        cleaned++;
      } else {
        // Update with filtered requests
        this.store.set(key, { ...entry, requests: validRequests });
      }
    }
    
    if (cleaned > 0) {
      console.log(`[RateLimiter] Cleaned up ${cleaned} expired entries`);
    }
  }
  
  // Start periodic cleanup
  private startCleanup(): void {
    // Cleanup every 5 minutes
    const CLEANUP_INTERVAL = 5 * 60 * 1000;
    
    // Use Deno's timer API
    this.cleanupInterval = setInterval(() => {
      this.cleanup(60000); // Default 1 minute window
    }, CLEANUP_INTERVAL) as unknown as number;
  }
  
  // Get store size (for monitoring)
  size(): number {
    return this.store.size;
  }
  
  // Clear all entries (for testing)
  clear(): void {
    this.store.clear();
  }
}

// Global store instance
const globalStore = new RateLimitStore();

// Get client IP from request
function getClientIP(req: Request): string {
  // Check for forwarded headers (when behind proxy/load balancer)
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Get first IP in the chain
    return forwarded.split(",")[0].trim();
  }
  
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  
  // Fallback to a default (can't get direct IP in Edge Functions)
  return "unknown";
}

// Default key generator (IP-based)
function defaultKeyGenerator(req: Request): string {
  return `ip:${getClientIP(req)}`;
}

// User-based key generator (requires auth header)
export function userKeyGenerator(req: Request): string {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    // Use a hash of the token (don't store raw tokens)
    const token = authHeader.replace("Bearer ", "").trim();
    // Simple hash for rate limiting purposes
    return `user:${hashString(token)}`;
  }
  return defaultKeyGenerator(req);
}

// Simple string hash function
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

// Rate limit result
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// Check rate limit for a request
export function checkRateLimit(
  req: Request,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const key = (mergedConfig.keyGenerator || defaultKeyGenerator)(req);
  const now = Date.now();
  
  // Get or create entry
  let entry = globalStore.get(key);
  
  if (!entry) {
    entry = {
      requests: [],
      createdAt: now,
    };
  }
  
  // Filter requests within the current window
  const windowStart = now - mergedConfig.windowMs;
  const requestsInWindow = entry.requests.filter(ts => ts > windowStart);
  
  // Check if limit exceeded
  const allowed = requestsInWindow.length < mergedConfig.maxRequests;
  const remaining = Math.max(0, mergedConfig.maxRequests - requestsInWindow.length - (allowed ? 1 : 0));
  
  // Calculate reset time (oldest request in window + window duration)
  const oldestRequest = requestsInWindow.length > 0 ? Math.min(...requestsInWindow) : now;
  const resetTime = oldestRequest + mergedConfig.windowMs;
  
  // Calculate retry after (if rate limited)
  const retryAfter = allowed ? undefined : Math.ceil((resetTime - now) / 1000);
  
  // Update store if allowed
  if (allowed) {
    requestsInWindow.push(now);
    globalStore.set(key, {
      ...entry,
      requests: requestsInWindow,
    });
  }
  
  return {
    allowed,
    limit: mergedConfig.maxRequests,
    remaining,
    resetTime,
    retryAfter,
  };
}

// Create rate limit middleware
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  
  return function rateLimitMiddleware(
    req: Request,
    logger?: Logger
  ): { allowed: boolean; result: RateLimitResult; headers?: Record<string, string> } {
    // Check if should skip
    if (mergedConfig.skip?.(req)) {
      return { 
      allowed: true, 
      result: {
        allowed: true,
        limit: mergedConfig.maxRequests,
        remaining: mergedConfig.maxRequests,
        resetTime: Date.now() + mergedConfig.windowMs,
      }
    };
    }
    
    const result = checkRateLimit(req, mergedConfig);
    
    // Build headers
    let headers: Record<string, string> | undefined;
    if (mergedConfig.headers) {
      headers = {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetTime / 1000)),
      };
      
      if (!result.allowed && result.retryAfter) {
        headers["Retry-After"] = String(result.retryAfter);
      }
    }
    
    // Log rate limit events
    if (!result.allowed && logger) {
      logger.warn("Rate limit exceeded", {
        key: (mergedConfig.keyGenerator || defaultKeyGenerator)(req),
        limit: result.limit,
        retryAfter: result.retryAfter,
      });
    }
    
    return { allowed: result.allowed, result, headers };
  };
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // Standard API rate limit: 60 requests per minute
  standard: createRateLimiter({
    maxRequests: 60,
    windowMs: 60 * 1000,
  }),
  
  // Strict rate limit: 10 requests per minute (for expensive operations)
  strict: createRateLimiter({
    maxRequests: 10,
    windowMs: 60 * 1000,
  }),
  
  // Chat endpoint rate limit: 30 messages per minute
  chat: createRateLimiter({
    maxRequests: 30,
    windowMs: 60 * 1000,
    keyGenerator: userKeyGenerator, // Per-user rate limiting
  }),
  
  // Registration rate limit: 5 attempts per 15 minutes
  registration: createRateLimiter({
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    message: "Too many registration attempts. Please try again later.",
  }),
  
  // Auth rate limit: 10 attempts per 5 minutes
  auth: createRateLimiter({
    maxRequests: 10,
    windowMs: 5 * 60 * 1000,
    message: "Too many authentication attempts. Please try again later.",
  }),
};

// Export store for monitoring/testing
export { globalStore as rateLimitStore };
