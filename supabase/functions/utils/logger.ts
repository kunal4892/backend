/******************************************************************************************
 * 📋 Structured Logging Utility
 *
 * Provides production-ready logging with:
 *  ✅ Request IDs for tracing
 *  ✅ Timestamps (ISO 8601)
 *  ✅ Log levels (DEBUG, INFO, WARN, ERROR)
 *  ✅ Correlation IDs for distributed tracing
 *  ✅ JSON output option for log aggregation
 *  ✅ Sensitive data redaction
 ******************************************************************************************/

// Log levels in order of severity
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Configuration
const CONFIG = {
  // Minimum log level to output (can be overridden via env)
  minLevel: (Deno.env.get("LOG_LEVEL") as keyof typeof LogLevel) || "INFO",
  // Enable JSON output for production log aggregation
  jsonOutput: Deno.env.get("LOG_FORMAT") === "json",
  // Request ID header name
  requestIdHeader: "x-request-id",
  // Correlation ID header name
  correlationIdHeader: "x-correlation-id",
  // Fields to redact from logs (security)
  sensitiveFields: ["password", "token", "secret", "key", "authorization", "fcm_token", "api_key"],
};

// Get numeric log level
function getLogLevel(level: string): LogLevel {
  return LogLevel[level as keyof typeof LogLevel] ?? LogLevel.INFO;
}

// Current minimum log level
const CURRENT_MIN_LEVEL = getLogLevel(CONFIG.minLevel);

// Generate a unique request ID
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// Generate a correlation ID (for distributed tracing)
export function generateCorrelationId(): string {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// Extract or generate request/correlation IDs from request
export function extractTraceIds(req: Request): { requestId: string; correlationId: string } {
  const requestId = req.headers.get(CONFIG.requestIdHeader) || generateRequestId();
  const correlationId = req.headers.get(CONFIG.correlationIdHeader) || generateCorrelationId();
  return { requestId, correlationId };
}

// Redact sensitive fields from log data
export function redactSensitive(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  
  if (typeof data === "string") {
    // Check if string looks like a sensitive value
    const lower = data.toLowerCase();
    if (CONFIG.sensitiveFields.some(field => lower.includes(field))) {
      return "[REDACTED]";
    }
    return data;
  }
  
  if (Array.isArray(data)) {
    return data.map(redactSensitive);
  }
  
  if (typeof data === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const keyLower = key.toLowerCase();
      if (CONFIG.sensitiveFields.some(field => keyLower.includes(field))) {
        redacted[key] = "[REDACTED]";
      } else {
        redacted[key] = redactSensitive(value);
      }
    }
    return redacted;
  }
  
  return data;
}

// Log entry structure
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  requestId?: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

// Build log entry
function buildLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error,
  requestId?: string,
  correlationId?: string
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: LogLevel[level],
    message,
  };
  
  if (requestId) entry.requestId = requestId;
  if (correlationId) entry.correlationId = correlationId;
  if (context) entry.context = redactSensitive(context) as Record<string, unknown>;
  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    };
  }
  
  return entry;
}

// Output log entry
function outputLog(entry: LogEntry, level: LogLevel): void {
  // Skip if below minimum level
  if (level < CURRENT_MIN_LEVEL) return;
  
  if (CONFIG.jsonOutput) {
    console.log(JSON.stringify(entry));
  } else {
    const { timestamp, level: levelStr, message, requestId, correlationId, context, error } = entry;
    const ids = requestId ? `[${requestId}]` : "";
    const corr = correlationId ? `(${correlationId})` : "";
    const ctx = context ? ` | ${JSON.stringify(context)}` : "";
    const err = error ? ` | ERROR: ${error.message}` : "";
    
    // Color codes for terminal output
    const colors: Record<string, string> = {
      DEBUG: "\x1b[36m", // Cyan
      INFO: "\x1b[32m",  // Green
      WARN: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      RESET: "\x1b[0m",
    };
    
    const color = colors[levelStr] || "";
    const reset = colors.RESET;
    
    console.log(`${color}[${timestamp}] [${levelStr}]${ids}${corr} ${message}${ctx}${err}${reset}`);
    
    if (error?.stack) {
      console.log(`${color}Stack: ${error.stack}${reset}`);
    }
  }
}

// Logger class for request-scoped logging
export class Logger {
  private requestId: string;
  private correlationId: string;
  
  constructor(requestId?: string, correlationId?: string) {
    this.requestId = requestId || generateRequestId();
    this.correlationId = correlationId || generateCorrelationId();
  }
  
  // Create logger from request
  static fromRequest(req: Request): Logger {
    const { requestId, correlationId } = extractTraceIds(req);
    return new Logger(requestId, correlationId);
  }
  
  // Get trace IDs
  getTraceIds(): { requestId: string; correlationId: string } {
    return { requestId: this.requestId, correlationId: this.correlationId };
  }
  
  // Add trace ID headers to response
  addTraceHeaders(headers: Headers): void {
    headers.set(CONFIG.requestIdHeader, this.requestId);
    headers.set(CONFIG.correlationIdHeader, this.correlationId);
  }
  
  // Log methods
  debug(message: string, context?: Record<string, unknown>): void {
    const entry = buildLogEntry(LogLevel.DEBUG, message, context, undefined, this.requestId, this.correlationId);
    outputLog(entry, LogLevel.DEBUG);
  }
  
  info(message: string, context?: Record<string, unknown>): void {
    const entry = buildLogEntry(LogLevel.INFO, message, context, undefined, this.requestId, this.correlationId);
    outputLog(entry, LogLevel.INFO);
  }
  
  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    const entry = buildLogEntry(LogLevel.WARN, message, context, error, this.requestId, this.correlationId);
    outputLog(entry, LogLevel.WARN);
  }
  
  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    const entry = buildLogEntry(LogLevel.ERROR, message, context, error, this.requestId, this.correlationId);
    outputLog(entry, LogLevel.ERROR);
  }
  
  // Log function execution time
  time<T>(label: string, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    const start = performance.now();
    this.debug(`Starting: ${label}`, context);
    
    return fn().finally(() => {
      const duration = Math.round(performance.now() - start);
      this.info(`Completed: ${label}`, { ...context, duration_ms: duration });
    });
  }
  
  // Create child logger with additional context
  child(additionalContext: Record<string, unknown>): { logger: Logger; context: Record<string, unknown> } {
    return {
      logger: this,
      context: additionalContext,
    };
  }
}

// Global logger for non-request contexts
export const globalLogger = new Logger("global", "global");

// Convenience exports
export const debug = (msg: string, ctx?: Record<string, unknown>) => globalLogger.debug(msg, ctx);
export const info = (msg: string, ctx?: Record<string, unknown>) => globalLogger.info(msg, ctx);
export const warn = (msg: string, ctx?: Record<string, unknown>, err?: Error) => globalLogger.warn(msg, ctx, err);
export const error = (msg: string, err?: Error, ctx?: Record<string, unknown>) => globalLogger.error(msg, err, ctx);
