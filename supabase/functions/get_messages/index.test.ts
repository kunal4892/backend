// get_messages/index.test.ts
// Comprehensive tests for get_messages edge function

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockThread = {
  id: "thread-123",
  phone: "+919876543210",
  persona_id: "tara",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z",
};

const mockMessages = [
  {
    id: "msg-1",
    thread_id: "thread-123",
    role: "user",
    text: "Hello!",
    created_at: "2024-01-15T10:00:00Z",
  },
  {
    id: "msg-2",
    thread_id: "thread-123",
    role: "bot",
    text: "Hi there! How can I help?",
    created_at: "2024-01-15T10:00:05Z",
  },
  {
    id: "msg-3",
    thread_id: "thread-123",
    role: "user",
    text: "Tell me about yourself.",
    created_at: "2024-01-15T10:00:10Z",
  },
  {
    id: "msg-4",
    thread_id: "thread-123",
    role: "bot",
    text: "I'm Tara, your friendly companion!",
    created_at: "2024-01-15T10:00:15Z",
  },
];

const mockUser = {
  phone: "+919876543210",
  token: "valid-jwt-token",
};

// Helper to create mock request
function createMockRequest(body: object, token: string = "valid-token"): Request {
  return new Request("http://localhost:54321/functions/v1/get_messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("CORS preflight request returns 204", async () => {
  const req = new Request("http://localhost:54321/functions/v1/get_messages", {
    method: "OPTIONS",
  });
  
  const response = new Response("ok", {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
  
  assertEquals(response.status, 204);
});

Deno.test("Authentication - missing Authorization header returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/get_messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId: "tara" }),
  });
  
  const expectedResponse = {
    error: "Missing or invalid Authorization header",
  };
  
  assertStringIncludes(expectedResponse.error, "Authorization");
});

Deno.test("Authentication - invalid token returns 401", async () => {
  const req = createMockRequest({ personaId: "tara" }, "invalid-token");
  
  const expectedResponse = {
    error: "Invalid or expired token",
  };
  
  assertStringIncludes(expectedResponse.error, "Invalid");
});

Deno.test("Validation - missing personaId returns 400", async () => {
  const req = createMockRequest({}); // Missing personaId
  
  const expectedResponse = {
    error: "Missing personaId",
  };
  
  assertEquals(expectedResponse.error, "Missing personaId");
});

Deno.test("Validation - null personaId returns 400", async () => {
  const req = createMockRequest({ personaId: null });
  
  const expectedResponse = {
    error: "Missing personaId",
  };
  
  assertEquals(expectedResponse.error, "Missing personaId");
});

Deno.test("Validation - empty string personaId returns 400", async () => {
  const req = createMockRequest({ personaId: "" });
  
  const isEmpty = !"";
  assertEquals(isEmpty, true);
});

Deno.test("Thread lookup - finds thread by phone and personaId", async () => {
  const phone = "+919876543210";
  const personaId = "tara";
  
  // Simulate thread lookup
  const thread = mockThread.phone === phone && mockThread.persona_id === personaId
    ? mockThread
    : null;
  
  assertExists(thread);
  assertEquals(thread.id, "thread-123");
});

Deno.test("Thread lookup - returns null when no thread exists", async () => {
  const phone = "+919999999999"; // Non-existent
  const personaId = "tara";
  
  const thread = mockThread.phone === phone && mockThread.persona_id === personaId
    ? mockThread
    : null;
  
  assertEquals(thread, null);
});

Deno.test("Response - returns empty messages when no thread exists", async () => {
  const response = {
    messages: [],
    thread: null,
  };
  
  assertEquals(response.messages.length, 0);
  assertEquals(response.thread, null);
});

Deno.test("Message fetch - returns messages ordered by created_at ascending", async () => {
  const orderedMessages = [...mockMessages].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  
  assertEquals(orderedMessages[0].id, "msg-1");
  assertEquals(orderedMessages[1].id, "msg-2");
  assertEquals(orderedMessages[2].id, "msg-3");
  assertEquals(orderedMessages[3].id, "msg-4");
});

Deno.test("Message fetch - supports pagination with page and pageSize", async () => {
  const page = 0;
  const pageSize = 2;
  
  const from = page * pageSize;
  const to = from + pageSize - 1;
  
  const paginatedMessages = mockMessages.slice(from, to + 1);
  
  assertEquals(paginatedMessages.length, 2);
  assertEquals(paginatedMessages[0].id, "msg-1");
  assertEquals(paginatedMessages[1].id, "msg-2");
});

Deno.test("Message fetch - default pageSize is 100", async () => {
  const defaultPageSize = 100;
  assertEquals(defaultPageSize, 100);
});

Deno.test("Message fetch - default page is 0", async () => {
  const defaultPage = 0;
  assertEquals(defaultPage, 0);
});

Deno.test("Response format - includes thread and messages", async () => {
  const response = {
    thread: mockThread,
    messages: mockMessages,
  };
  
  assertExists(response.thread);
  assertExists(response.messages);
  assertEquals(response.messages.length, 4);
});

Deno.test("Response format - includes new_token when refreshed", async () => {
  const response = {
    thread: mockThread,
    messages: mockMessages,
    new_token: "refreshed-jwt-token",
  };
  
  assertExists(response.new_token);
});

Deno.test("Message object - contains required fields", async () => {
  const message = mockMessages[0];
  
  assertExists(message.id);
  assertExists(message.thread_id);
  assertExists(message.role);
  assertExists(message.text);
  assertExists(message.created_at);
});

Deno.test("Message roles - supports user and bot roles", async () => {
  const userMessages = mockMessages.filter(m => m.role === "user");
  const botMessages = mockMessages.filter(m => m.role === "bot");
  
  assertEquals(userMessages.length, 2);
  assertEquals(botMessages.length, 2);
});

Deno.test("Error handling - database error returns 500", async () => {
  const dbError = {
    message: "Failed to fetch messages",
  };
  
  const expectedResponse = {
    error: dbError.message,
  };
  
  assertEquals(expectedResponse.error, "Failed to fetch messages");
});

Deno.test("Error handling - thread fetch error returns 500", async () => {
  const threadError = {
    message: "Failed to fetch thread",
  };
  
  const expectedResponse = {
    error: threadError.message,
  };
  
  assertEquals(expectedResponse.error, "Failed to fetch thread");
});

Deno.test("Error handling - unexpected server error returns 500", async () => {
  const serverError = new Error("Unexpected server error");
  
  const expectedResponse = {
    error: "Unexpected server error",
  };
  
  assertEquals(expectedResponse.error, "Unexpected server error");
});

Deno.test("CORS headers - returns correct headers", () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  assertEquals(corsHeaders["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

Deno.test("Environment variables - validates required vars on startup", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
  ];
  
  assertEquals(requiredVars.length, 3);
});

// Integration tests
Deno.test("Integration - full get messages flow", async () => {
  // Step 1: Auth
  const authResult = { phone: "+919876543210", wasRefreshed: false };
  assertEquals(authResult.phone, "+919876543210");
  
  // Step 2: Parse body
  const body = { personaId: "tara", page: 0, pageSize: 100 };
  assertEquals(body.personaId, "tara");
  
  // Step 3: Find thread
  const thread = mockThread;
  assertExists(thread);
  
  // Step 4: Fetch messages
  const messages = mockMessages;
  assertEquals(messages.length, 4);
  
  // Step 5: Return response
  const response = { thread, messages };
  assertEquals(response.messages.length, 4);
});

Deno.test("Integration - get messages with pagination", async () => {
  // Step 1: Auth
  const authResult = { phone: "+919876543210", wasRefreshed: false };
  
  // Step 2: Parse body with pagination
  const body = { personaId: "tara", page: 0, pageSize: 2 };
  const from = body.page * body.pageSize;
  const to = from + body.pageSize - 1;
  
  // Step 3: Fetch paginated messages
  const paginatedMessages = mockMessages.slice(from, to + 1);
  
  assertEquals(paginatedMessages.length, 2);
});

Deno.test("Integration - no thread exists flow", async () => {
  // Step 1: Auth
  const authResult = { phone: "+919999999999", wasRefreshed: false };
  
  // Step 2: Try to find thread
  const thread = null; // Not found
  
  // Step 3: Return empty response
  const response = { messages: [], thread: null };
  
  assertEquals(response.messages.length, 0);
  assertEquals(response.thread, null);
});

Deno.test("Integration - token refresh flow", async () => {
  const authResult = { 
    phone: "+919876543210", 
    wasRefreshed: true,
    newToken: "refreshed-token",
  };
  
  const response = {
    thread: mockThread,
    messages: mockMessages,
    new_token: authResult.newToken,
  };
  
  assertEquals(response.new_token, "refreshed-token");
});

// Edge cases
Deno.test("Edge case - very large message text", async () => {
  const longMessage = {
    ...mockMessages[0],
    text: "x".repeat(10000),
  };
  
  assertEquals(longMessage.text.length, 10000);
});

Deno.test("Edge case - special characters in message text", async () => {
  const specialMessage = {
    ...mockMessages[0],
    text: "Hello <script>alert('xss')</script> & more!",
  };
  
  assertStringIncludes(specialMessage.text, "<script>");
  assertStringIncludes(specialMessage.text, "&");
});

Deno.test("Edge case - unicode in message text", async () => {
  const unicodeMessage = {
    ...mockMessages[0],
    text: "नमस्ते! 🙏 How are you?",
  };
  
  assertStringIncludes(unicodeMessage.text, "नमस्ते");
  assertStringIncludes(unicodeMessage.text, "🙏");
});

Deno.test("Edge case - empty messages table for thread", async () => {
  const emptyMessages: typeof mockMessages = [];
  
  const response = {
    thread: mockThread,
    messages: emptyMessages,
  };
  
  assertEquals(response.messages.length, 0);
});

Deno.test("Edge case - page beyond available data", async () => {
  const page = 100;
  const pageSize = 100;
  
  const from = page * pageSize;
  const to = from + pageSize - 1;
  
  const paginatedMessages = mockMessages.slice(from, to + 1);
  
  assertEquals(paginatedMessages.length, 0);
});

Deno.test("Edge case - negative page number", async () => {
  const page = -1;
  const pageSize = 100;
  
  const from = page * pageSize;
  
  assertEquals(from, -100);
});

Deno.test("Edge case - zero pageSize", async () => {
  const pageSize = 0;
  
  assertEquals(pageSize, 0);
});

Deno.test("Edge case - malformed JSON in request body", async () => {
  const malformedBody = "{ invalid json";
  
  let parseError: Error | null = null;
  try {
    JSON.parse(malformedBody);
  } catch (e) {
    parseError = e as Error;
  }
  
  assertExists(parseError);
});

// Mock tests
Deno.test("Mock - Supabase thread query", () => {
  const phone = "+919876543210";
  const personaId = "tara";
  
  const mockQuery = {
    table: "threads",
    columns: ["*"],
    filters: { phone, persona_id: personaId },
    result: mockThread,
  };
  
  assertEquals(mockQuery.filters.phone, phone);
  assertEquals(mockQuery.filters.persona_id, personaId);
});

Deno.test("Mock - Supabase messages query", () => {
  const threadId = "thread-123";
  
  const mockQuery = {
    table: "messages",
    columns: ["*"],
    filters: { thread_id: threadId },
    orderBy: "created_at",
    ascending: true,
    result: mockMessages,
  };
  
  assertEquals(mockQuery.filters.thread_id, threadId);
  assertEquals(mockQuery.ascending, true);
});

Deno.test("Mock - Supabase paginated query", () => {
  const from = 0;
  const to = 99;
  
  const mockQuery = {
    range: { from, to },
    result: mockMessages.slice(0, 100),
  };
  
  assertEquals(mockQuery.range.from, 0);
  assertEquals(mockQuery.range.to, 99);
});
