/******************************************************************************************
 * 📋 Logger Tests
 ******************************************************************************************/

import { 
  Logger, 
  LogLevel, 
  generateRequestId, 
  generateCorrelationId,
  extractTraceIds,
  redactSensitive,
  globalLogger,
  debug,
  info,
  warn,
  error
} from "./logger.ts";

// Test utilities
function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`❌ ${message}\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
  console.log(`✅ ${message}`);
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ ${message}`);
  }
  console.log(`✅ ${message}`);
}

function assertFalse(condition: boolean, message: string): void {
  if (condition) {
    throw new Error(`❌ ${message}`);
  }
  console.log(`✅ ${message}`);
}

// Tests
console.log("\n=== Logger Tests ===\n");

// Test 1: Generate request ID
console.log("\n--- Request ID Generation ---");
{
  const requestId = generateRequestId();
  assertTrue(requestId.length > 0, "Request ID should not be empty");
  assertTrue(requestId.includes("-"), "Request ID should contain hyphen");
  
  // Should be unique
  const requestId2 = generateRequestId();
  assertFalse(requestId === requestId2, "Request IDs should be unique");
}

// Test 2: Generate correlation ID
console.log("\n--- Correlation ID Generation ---");
{
  const correlationId = generateCorrelationId();
  assertTrue(correlationId.startsWith("corr-"), "Correlation ID should start with 'corr-'");
  assertTrue(correlationId.length > 5, "Correlation ID should not be empty");
}

// Test 3: Extract trace IDs from request
console.log("\n--- Trace ID Extraction ---");
{
  // Without headers - should generate new IDs
  const req1 = new Request("http://localhost/test");
  const ids1 = extractTraceIds(req1);
  assertTrue(ids1.requestId.length > 0, "Should generate request ID when header missing");
  assertTrue(ids1.correlationId.length > 0, "Should generate correlation ID when header missing");
  
  // With headers - should extract existing IDs
  const headers = new Headers();
  headers.set("x-request-id", "test-request-123");
  headers.set("x-correlation-id", "test-corr-456");
  const req2 = new Request("http://localhost/test", { headers });
  const ids2 = extractTraceIds(req2);
  assertEquals(ids2.requestId, "test-request-123", "Should extract request ID from header");
  assertEquals(ids2.correlationId, "test-corr-456", "Should extract correlation ID from header");
}

// Test 4: Redact sensitive data
console.log("\n--- Sensitive Data Redaction ---");
{
  // String with sensitive keyword
  const sensitiveString = redactSensitive("my password is secret123");
  assertEquals(sensitiveString, "[REDACTED]", "Should redact string containing 'password'");
  
  // Normal string
  const normalString = redactSensitive("hello world");
  assertEquals(normalString, "hello world", "Should not redact normal string");
  
  // Object with sensitive fields
  const obj = {
    username: "john",
    password: "secret123",
    api_key: "abc123",
    token: "jwt-token-here",
    normal_field: "visible"
  };
  const redactedObj = redactSensitive(obj) as Record<string, string>;
  assertEquals(redactedObj.username, "john", "Should not redact username");
  assertEquals(redactedObj.password, "[REDACTED]", "Should redact password field");
  assertEquals(redactedObj.api_key, "[REDACTED]", "Should redact api_key field");
  assertEquals(redactedObj.token, "[REDACTED]", "Should redact token field");
  assertEquals(redactedObj.normal_field, "visible", "Should not redact normal field");
  
  // Array with sensitive values
  const arr = ["password", "normal", "secret key"];
  const redactedArr = redactSensitive(arr) as string[];
  assertEquals(redactedArr[0], "[REDACTED]", "Should redact sensitive array item");
  assertEquals(redactedArr[1], "normal", "Should not redact normal array item");
  assertEquals(redactedArr[2], "[REDACTED]", "Should redact sensitive array item");
}

// Test 5: Logger creation
console.log("\n--- Logger Creation ---");
{
  const logger = new Logger("test-req-123", "test-corr-456");
  const traceIds = logger.getTraceIds();
  assertEquals(traceIds.requestId, "test-req-123", "Logger should store request ID");
  assertEquals(traceIds.correlationId, "test-corr-456", "Logger should store correlation ID");
  
  // Create from request
  const headers = new Headers();
  headers.set("x-request-id", "from-req-789");
  const req = new Request("http://localhost/test", { headers });
  const loggerFromReq = Logger.fromRequest(req);
  const traceIdsFromReq = loggerFromReq.getTraceIds();
  assertEquals(traceIdsFromReq.requestId, "from-req-789", "Logger should extract request ID from request");
}

// Test 6: Logger methods (basic smoke test)
console.log("\n--- Logger Methods ---");
{
  const logger = new Logger("test", "test");
  
  // These should not throw
  try {
    logger.debug("Debug message", { key: "value" });
    logger.info("Info message", { key: "value" });
    logger.warn("Warning message", { key: "value" });
    logger.error("Error message", new Error("Test error"), { key: "value" });
    console.log("✅ All logger methods executed without error");
  } catch (e) {
    throw new Error(`❌ Logger method failed: ${(e as Error).message}`);
  }
}

// Test 7: Add trace headers to response
console.log("\n--- Trace Headers ---");
{
  const logger = new Logger("req-123", "corr-456");
  const headers = new Headers();
  logger.addTraceHeaders(headers);
  assertEquals(headers.get("x-request-id"), "req-123", "Should add request ID header");
  assertEquals(headers.get("x-correlation-id"), "corr-456", "Should add correlation ID header");
}

// Test 8: Time logging
console.log("\n--- Time Logging ---");
{
  const logger = new Logger("test", "test");
  
  // Test async timing
  const result = await logger.time("test-operation", async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return "result";
  });
  
  assertEquals(result, "result", "Time method should return function result");
}

// Test 9: Global logger exports
console.log("\n--- Global Logger ---");
{
  // These should not throw
  try {
    debug("Debug from global");
    info("Info from global");
    warn("Warning from global");
    error("Error from global", new Error("Test"));
    console.log("✅ Global logger functions executed without error");
  } catch (e) {
    throw new Error(`❌ Global logger failed: ${(e as Error).message}`);
  }
}

// Test 10: Child logger
console.log("\n--- Child Logger ---");
{
  const logger = new Logger("parent-req", "parent-corr");
  const child = logger.child({ additional: "context" });
  assertEquals(child.logger, logger, "Child should reference parent logger");
  assertEquals(child.context.additional, "context", "Child should have additional context");
}

console.log("\n=== All Logger Tests Passed! ===\n");
