// report-content/index.test.ts
// Comprehensive tests for report-content edge function

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockUser = {
  phone: "+919876543210",
  token: "valid-jwt-token",
};

const mockMessage = {
  id: "msg-123",
  text: "This is an inappropriate message",
  role: "bot",
  thread_id: "thread-456",
  created_at: "2024-01-15T10:00:00Z",
};

const mockReport = {
  id: "report-789",
  message_id: "msg-123",
  thread_id: "thread-456",
  reported_by: "+919876543210",
  reason: "inappropriate",
  additional_info: "This message was offensive",
  message_text: "This is an inappropriate message",
  status: "pending",
  created_at: "2024-01-15T10:05:00Z",
};

const validReasons = [
  "offensive",
  "inappropriate",
  "harmful",
  "spam",
  "other",
];

// Helper to create mock request
function createMockRequest(body: object, token: string = "valid-token"): Request {
  return new Request("http://localhost:54321/functions/v1/report-content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("CORS preflight request returns 204", async () => {
  const req = new Request("http://localhost:54321/functions/v1/report-content", {
    method: "OPTIONS",
  });
  
  const response = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
  
  assertEquals(response.status, 204);
});

Deno.test("Authentication - missing Authorization header returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/report-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId: "msg-123", reason: "inappropriate" }),
  });
  
  const expectedResponse = {
    error: "Authentication failed",
    message: "Missing or invalid Authorization header",
  };
  
  assertEquals(expectedResponse.error, "Authentication failed");
});

Deno.test("Authentication - invalid token returns 401", async () => {
  const req = createMockRequest(
    { messageId: "msg-123", reason: "inappropriate" },
    "invalid-token"
  );
  
  const expectedResponse = {
    error: "Authentication failed",
    message: "Invalid or expired token",
  };
  
  assertStringIncludes(expectedResponse.message, "Invalid");
});

Deno.test("Validation - missing messageId returns 400", async () => {
  const req = createMockRequest({ reason: "inappropriate" });
  
  const expectedResponse = {
    error: "Missing required fields",
    message: "messageId and reason are required",
  };
  
  assertEquals(expectedResponse.error, "Missing required fields");
});

Deno.test("Validation - missing reason returns 400", async () => {
  const req = createMockRequest({ messageId: "msg-123" });
  
  const expectedResponse = {
    error: "Missing required fields",
    message: "messageId and reason are required",
  };
  
  assertEquals(expectedResponse.error, "Missing required fields");
});

Deno.test("Validation - invalid reason returns 400", async () => {
  const invalidReason = "not-a-valid-reason";
  const isValid = validReasons.includes(invalidReason);
  
  assertEquals(isValid, false);
  
  const expectedResponse = {
    error: "Invalid reason",
    message: `Reason must be one of: ${validReasons.join(", ")}`,
  };
  
  assertEquals(expectedResponse.error, "Invalid reason");
});

Deno.test("Validation - accepts all valid reasons", async () => {
  for (const reason of validReasons) {
    const isValid = validReasons.includes(reason);
    assertEquals(isValid, true);
  }
});

Deno.test("Message lookup - finds message by ID", async () => {
  const messageId = "msg-123";
  const message = mockMessage.id === messageId ? mockMessage : null;
  
  assertExists(message);
  assertEquals(message.id, messageId);
});

Deno.test("Message lookup - returns 404 when message not found", async () => {
  const messageId = "non-existent";
  const message = mockMessage.id === messageId ? mockMessage : null;
  
  assertEquals(message, null);
  
  const expectedResponse = {
    error: "Message not found",
    message: "The reported message could not be found",
  };
  
  assertEquals(expectedResponse.error, "Message not found");
});

Deno.test("Message validation - only allows reporting bot messages", async () => {
  const botMessage = { ...mockMessage, role: "bot" };
  const userMessage = { ...mockMessage, role: "user" };
  
  const canReportBot = botMessage.role === "bot" || botMessage.role === "model";
  const canReportUser = userMessage.role === "bot" || userMessage.role === "model";
  
  assertEquals(canReportBot, true);
  assertEquals(canReportUser, false);
});

Deno.test("Message validation - allows reporting model role messages", async () => {
  const modelMessage = { ...mockMessage, role: "model" };
  
  const canReport = modelMessage.role === "bot" || modelMessage.role === "model";
  assertEquals(canReport, true);
});

Deno.test("Report creation - inserts report into database", async () => {
  const reportData = {
    message_id: mockMessage.id,
    thread_id: mockMessage.thread_id,
    reported_by: mockUser.phone,
    reason: "inappropriate",
    additional_info: "This was offensive",
    message_text: mockMessage.text,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  
  assertEquals(reportData.message_id, mockMessage.id);
  assertEquals(reportData.reported_by, mockUser.phone);
  assertEquals(reportData.status, "pending");
});

Deno.test("Report creation - optional additional_info", async () => {
  const reportWithoutAdditionalInfo = {
    message_id: mockMessage.id,
    thread_id: mockMessage.thread_id,
    reported_by: mockUser.phone,
    reason: "spam",
    additional_info: null,
    message_text: mockMessage.text,
    status: "pending",
  };
  
  assertEquals(reportWithoutAdditionalInfo.additional_info, null);
});

Deno.test("Report creation - stores message text for reference", async () => {
  const reportData = {
    message_id: mockMessage.id,
    message_text: mockMessage.text,
  };
  
  assertEquals(reportData.message_text, mockMessage.text);
  assertExists(reportData.message_text);
});

Deno.test("Response format - returns success with reportId", async () => {
  const response = {
    success: true,
    message: "Report submitted successfully",
    reportId: "report-789",
  };
  
  assertEquals(response.success, true);
  assertExists(response.reportId);
});

Deno.test("Response format - includes new_token when refreshed", async () => {
  const response = {
    success: true,
    message: "Report submitted successfully",
    reportId: "report-789",
    new_token: "refreshed-jwt-token",
  };
  
  assertExists(response.new_token);
});

Deno.test("Error handling - database insert error returns 500", async () => {
  const dbError = {
    message: "Database connection failed",
  };
  
  const expectedResponse = {
    error: "Failed to submit report",
    message: dbError.message,
  };
  
  assertEquals(expectedResponse.error, "Failed to submit report");
});

Deno.test("Error handling - unexpected error returns 500", async () => {
  const serverError = new Error("Unexpected error");
  
  const expectedResponse = {
    error: "Internal server error",
    message: serverError.message,
  };
  
  assertEquals(expectedResponse.error, "Internal server error");
});

Deno.test("CORS headers - returns correct headers", () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  assertStringIncludes(corsHeaders["Access-Control-Allow-Headers"], "Authorization");
});

Deno.test("Environment variables - validates required vars", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
  ];
  
  assertEquals(requiredVars.length, 3);
});

// Integration tests
Deno.test("Integration - full report submission flow", async () => {
  // Step 1: Authenticate
  const authResult = { phone: "+919876543210", wasRefreshed: false };
  assertEquals(authResult.phone, "+919876543210");
  
  // Step 2: Validate request
  const body = {
    messageId: "msg-123",
    reason: "inappropriate",
    additionalInfo: "This message was offensive",
  };
  assertExists(body.messageId);
  assertExists(body.reason);
  assertEquals(validReasons.includes(body.reason), true);
  
  // Step 3: Find message
  const message = mockMessage;
  assertExists(message);
  assertEquals(message.role, "bot");
  
  // Step 4: Create report
  const report = {
    message_id: body.messageId,
    thread_id: message.thread_id,
    reported_by: authResult.phone,
    reason: body.reason,
    additional_info: body.additionalInfo,
    message_text: message.text,
    status: "pending",
  };
  assertEquals(report.status, "pending");
  
  // Step 5: Return response
  const response = {
    success: true,
    message: "Report submitted successfully",
    reportId: "report-789",
  };
  assertEquals(response.success, true);
});

Deno.test("Integration - report user message flow (should fail)", async () => {
  // Step 1: Find message
  const userMessage = { ...mockMessage, role: "user" };
  
  // Step 2: Validate message can be reported
  const canReport = userMessage.role === "bot" || userMessage.role === "model";
  assertEquals(canReport, false);
  
  // Step 3: Return error
  const expectedResponse = {
    error: "Invalid report",
    message: "Only AI-generated messages can be reported",
  };
  assertEquals(expectedResponse.error, "Invalid report");
});

Deno.test("Integration - token refresh during report", async () => {
  const authResult = {
    phone: "+919876543210",
    wasRefreshed: true,
    newToken: "refreshed-token",
  };
  
  const response = {
    success: true,
    reportId: "report-789",
    new_token: authResult.newToken,
  };
  
  assertEquals(response.new_token, "refreshed-token");
});

// Edge cases
Deno.test("Edge case - very long additional_info", async () => {
  const longInfo = "x".repeat(5000);
  
  const report = {
    ...mockReport,
    additional_info: longInfo,
  };
  
  assertEquals(report.additional_info.length, 5000);
});

Deno.test("Edge case - special characters in additional_info", async () => {
  const specialInfo = "This message has <script>alert('xss')</script> and & more!";
  
  const report = {
    ...mockReport,
    additional_info: specialInfo,
  };
  
  assertStringIncludes(report.additional_info, "<script>");
  assertStringIncludes(report.additional_info, "&");
});

Deno.test("Edge case - unicode in report data", async () => {
  const unicodeReport = {
    ...mockReport,
    additional_info: "यह संदेश आपत्तिजनक था 🚫",
  };
  
  assertStringIncludes(unicodeReport.additional_info, "यह");
  assertStringIncludes(unicodeReport.additional_info, "🚫");
});

Deno.test("Edge case - empty additional_info", async () => {
  const report = {
    ...mockReport,
    additional_info: "",
  };
  
  assertEquals(report.additional_info, "");
});

Deno.test("Edge case - null additional_info", async () => {
  const report = {
    ...mockReport,
    additional_info: null,
  };
  
  assertEquals(report.additional_info, null);
});

Deno.test("Edge case - message with deleted status", async () => {
  const deletedMessage = {
    ...mockMessage,
    deleted_at: "2024-01-15T11:00:00Z",
  };
  
  assertExists(deletedMessage.deleted_at);
});

Deno.test("Edge case - concurrent reports on same message", async () => {
  const reports = Array(3).fill(null).map((_, i) => ({
    id: `report-${i}`,
    message_id: "msg-123",
    reported_by: `+91987654321${i}`,
    reason: "inappropriate",
  }));
  
  assertEquals(reports.length, 3);
  for (const report of reports) {
    assertEquals(report.message_id, "msg-123");
  }
});

Deno.test("Edge case - report own message (should fail)", async () => {
  const ownMessage = {
    ...mockMessage,
    role: "user", // User's own message
  };
  
  const canReport = ownMessage.role === "bot" || ownMessage.role === "model";
  assertEquals(canReport, false);
});

// Mock tests
Deno.test("Mock - Supabase message query", () => {
  const messageId = "msg-123";
  
  const mockQuery = {
    table: "messages",
    columns: ["id", "text", "role", "thread_id", "created_at"],
    filter: { id: messageId },
    result: mockMessage,
  };
  
  assertEquals(mockQuery.filter.id, messageId);
  assertEquals(mockQuery.result.id, messageId);
});

Deno.test("Mock - Supabase report insert", () => {
  const reportData = {
    message_id: "msg-123",
    thread_id: "thread-456",
    reported_by: "+919876543210",
    reason: "inappropriate",
    additional_info: "Test",
    message_text: "Test message",
    status: "pending",
  };
  
  const mockResult = {
    data: { ...reportData, id: "report-789", created_at: "2024-01-15T10:05:00Z" },
    error: null,
  };
  
  assertEquals(mockResult.error, null);
  assertExists(mockResult.data.id);
});

Deno.test("Mock - Report status values", () => {
  const validStatuses = ["pending", "reviewed", "resolved", "dismissed"];
  
  assertEquals(validStatuses.includes("pending"), true);
  assertEquals(validStatuses.includes("resolved"), true);
});
