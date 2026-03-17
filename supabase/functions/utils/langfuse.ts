/******************************************************************************************
 * 🔍 Langfuse Tracing Integration
 *
 * Provides LLM observability with:
 *  ✅ Traces for end-to-end request tracking
 *  ✅ Spans for operation grouping
 *  ✅ Generations for LLM call tracking
 *  ✅ Graceful degradation when Langfuse unavailable
 *  ✅ Integration with existing Logger for correlation IDs
 *  ✅ Sensitive data redaction (phone numbers, tokens)
 ******************************************************************************************/

import { Logger } from "./logger.ts";

// Langfuse configuration from environment
const LANGFUSE_PUBLIC_KEY = Deno.env.get("LANGFUSE_PUBLIC_KEY");
const LANGFUSE_SECRET_KEY = Deno.env.get("LANGFUSE_SECRET_KEY");
const LANGFUSE_HOST = Deno.env.get("LANGFUSE_HOST") || "http://localhost:3000";

// Check if Langfuse is configured
const isLangfuseEnabled = !!(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);

// Types for Langfuse API
interface LangfuseTrace {
  id: string;
  name: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface LangfuseSpan {
  id: string;
  traceId: string;
  name: string;
  startTime: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
}

interface LangfuseGeneration {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  startTime: number;
  endTime?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  metadata?: Record<string, unknown>;
}

// In-memory queue for offline mode
const pendingEvents: Array<{
  type: "trace" | "span" | "generation" | "update";
  data: unknown;
  endpoint?: string;
}> = [];

let flushInterval: number | null = null;

/**
 * Hash a phone number for privacy in traces
 */
export function hashPhone(phone: string): string {
  // Simple hash for privacy - in production use a proper hash like SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(phone + "salt");
  
  // Use a simple hash function since we can't use crypto.subtle in all contexts
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    const char = phone.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `user_${Math.abs(hash).toString(16).substring(0, 8)}`;
}

/**
 * Redact sensitive data from traces
 */
function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  
  if (typeof data === "string") {
    // Redact API keys, tokens, secrets
    return data
      .replace(/\b[A-Za-z0-9_]{32,}\b/g, "[REDACTED_KEY]")
      .replace(/\bBearer\s+[A-Za-z0-9_\-\.]+/g, "Bearer [REDACTED_TOKEN]");
  }
  
  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }
  
  if (typeof data === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (keyLower.includes("token") || 
          keyLower.includes("key") || 
          keyLower.includes("secret") || 
          keyLower.includes("password") ||
          keyLower.includes("auth")) {
        redacted[key] = "[REDACTED]";
      } else if (keyLower.includes("phone") || keyLower.includes("mobile")) {
        redacted[key] = hashPhone(String(value));
      } else {
        redacted[key] = redactSensitiveData(value);
      }
    }
    return redacted;
  }
  
  return data;
}

/**
 * Make authenticated request to Langfuse API
 */
async function langfuseRequest(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" = "POST",
  body?: unknown
): Promise<Response | null> {
  if (!isLangfuseEnabled) return null;
  
  try {
    const auth = btoa(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`);
    
    const response = await fetch(`${LANGFUSE_HOST}/api/public${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      console.warn(`[Langfuse] API request failed: ${response.status} ${response.statusText}`);
      return null;
    }
    
    return response;
  } catch (error) {
    console.warn("[Langfuse] Request failed:", error);
    return null;
  }
}

/**
 * Langfuse client class for managing traces
 */
export class LangfuseClient {
  private logger: Logger;
  private traceId: string | null = null;
  private spans: Map<string, LangfuseSpan> = new Map();
  private generations: Map<string, LangfuseGeneration> = new Map();
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  /**
   * Check if Langfuse is enabled
   */
  isEnabled(): boolean {
    return isLangfuseEnabled;
  }
  
  /**
   * Start a new trace
   */
  async startTrace(options: {
    name: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<string | null> {
    if (!isLangfuseEnabled) {
      this.logger.debug("Langfuse not configured, skipping trace");
      return null;
    }
    
    const traceId = crypto.randomUUID();
    this.traceId = traceId;
    
    const { requestId, correlationId } = this.logger.getTraceIds();
    
    const trace: LangfuseTrace = {
      id: traceId,
      name: options.name,
      userId: options.userId ? hashPhone(options.userId) : undefined,
      metadata: {
        ...redactSensitiveData(options.metadata),
        requestId,
        correlationId,
        timestamp: new Date().toISOString(),
      },
      tags: options.tags,
    };
    
    // Send trace to Langfuse
    const response = await langfuseRequest("/traces", "POST", {
      id: traceId,
      name: options.name,
      userId: trace.userId,
      metadata: trace.metadata,
      tags: options.tags,
    });
    
    if (response) {
      this.logger.debug("Langfuse trace started", { traceId, name: options.name });
    }
    
    return traceId;
  }
  
  /**
   * Start a span within the current trace
   */
  async startSpan(name: string, metadata?: Record<string, unknown>): Promise<string | null> {
    if (!isLangfuseEnabled || !this.traceId) return null;
    
    const spanId = crypto.randomUUID();
    const span: LangfuseSpan = {
      id: spanId,
      traceId: this.traceId,
      name,
      startTime: Date.now(),
      metadata: redactSensitiveData(metadata) as Record<string, unknown>,
    };
    
    this.spans.set(spanId, span);
    
    await langfuseRequest("/spans", "POST", {
      id: spanId,
      traceId: this.traceId,
      name,
      startTime: new Date(span.startTime).toISOString(),
      metadata: span.metadata,
    });
    
    return spanId;
  }
  
  /**
   * End a span
   */
  async endSpan(spanId: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!isLangfuseEnabled) return;
    
    const span = this.spans.get(spanId);
    if (!span) return;
    
    span.endTime = Date.now();
    if (metadata) {
      span.metadata = { ...span.metadata, ...redactSensitiveData(metadata) };
    }
    
    await langfuseRequest("/spans", "PATCH", {
      id: spanId,
      traceId: span.traceId,
      endTime: new Date(span.endTime).toISOString(),
      metadata: span.metadata,
    });
    
    this.spans.delete(spanId);
  }
  
  /**
   * Start a generation (LLM call) within the current trace
   */
  async startGeneration(options: {
    name: string;
    model: string;
    input: unknown;
    parentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string | null> {
    if (!isLangfuseEnabled || !this.traceId) return null;
    
    const generationId = crypto.randomUUID();
    const generation: LangfuseGeneration = {
      id: generationId,
      traceId: this.traceId,
      parentId: options.parentId,
      name: options.name,
      model: options.model,
      input: redactSensitiveData(options.input),
      startTime: Date.now(),
      metadata: redactSensitiveData(options.metadata) as Record<string, unknown>,
    };
    
    this.generations.set(generationId, generation);
    
    await langfuseRequest("/generations", "POST", {
      id: generationId,
      traceId: this.traceId,
      parentObservationId: options.parentId,
      name: options.name,
      model: options.model,
      input: generation.input,
      startTime: new Date(generation.startTime).toISOString(),
      metadata: generation.metadata,
    });
    
    return generationId;
  }
  
  /**
   * End a generation with output and token usage
   */
  async endGeneration(
    generationId: string,
    output: unknown,
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  ): Promise<void> {
    if (!isLangfuseEnabled) return;
    
    const generation = this.generations.get(generationId);
    if (!generation) return;
    
    generation.endTime = Date.now();
    generation.output = redactSensitiveData(output);
    generation.usage = usage;
    
    await langfuseRequest("/generations", "PATCH", {
      id: generationId,
      traceId: generation.traceId,
      output: generation.output,
      endTime: new Date(generation.endTime).toISOString(),
      usage: usage ? {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      } : undefined,
    });
    
    this.generations.delete(generationId);
  }
  
  /**
   * Record an error in the current trace
   */
  async recordError(error: Error, context?: Record<string, unknown>): Promise<void> {
    if (!isLangfuseEnabled || !this.traceId) return;
    
    await langfuseRequest("/observations", "POST", {
      id: crypto.randomUUID(),
      traceId: this.traceId,
      type: "EVENT",
      name: "error",
      metadata: {
        errorMessage: error.message,
        errorStack: error.stack,
        ...redactSensitiveData(context),
      },
    });
  }
  
  /**
   * Update trace with final metadata
   */
  async updateTrace(metadata: Record<string, unknown>): Promise<void> {
    if (!isLangfuseEnabled || !this.traceId) return;
    
    await langfuseRequest("/traces", "PATCH", {
      id: this.traceId,
      metadata: {
        ...redactSensitiveData(metadata),
        endTime: new Date().toISOString(),
      },
    });
  }
  
  /**
   * Get current trace ID
   */
  getTraceId(): string | null {
    return this.traceId;
  }
}

/**
 * Create a Langfuse client from a request
 */
export function createLangfuseClient(logger: Logger): LangfuseClient {
  return new LangfuseClient(logger);
}

/**
 * Wrap a function with tracing
 */
export async function withTracing<T>(
  langfuse: LangfuseClient,
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const spanId = await langfuse.startSpan(name, metadata);
  const startTime = performance.now();
  
  try {
    const result = await fn();
    const duration = Math.round(performance.now() - startTime);
    
    if (spanId) {
      await langfuse.endSpan(spanId, { duration_ms: duration, status: "success" });
    }
    
    return result;
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    
    if (spanId) {
      await langfuse.endSpan(spanId, { 
        duration_ms: duration, 
        status: "error",
        error: (error as Error).message,
      });
    }
    
    throw error;
  }
}

/**
 * Wrap an LLM call with generation tracing
 */
export async function withGenerationTracing<T>(
  langfuse: LangfuseClient,
  options: {
    name: string;
    model: string;
    input: unknown;
    metadata?: Record<string, unknown>;
  },
  fn: () => Promise<{ result: T; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }>
): Promise<T> {
  const generationId = await langfuse.startGeneration({
    name: options.name,
    model: options.model,
    input: options.input,
    metadata: options.metadata,
  });
  
  try {
    const { result, usage } = await fn();
    
    if (generationId) {
      await langfuse.endGeneration(generationId, result, usage);
    }
    
    return result;
  } catch (error) {
    if (generationId) {
      await langfuse.endGeneration(generationId, { error: (error as Error).message });
    }
    throw error;
  }
}

// Log Langfuse status on module load
if (isLangfuseEnabled) {
  console.log(`[Langfuse] Tracing enabled, host: ${LANGFUSE_HOST}`);
} else {
  console.log("[Langfuse] Tracing disabled (set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable)");
}
