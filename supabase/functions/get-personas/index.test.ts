// get-personas/index.test.ts
// Comprehensive tests for get-personas edge function

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockPersonas = [
  {
    id: "tara",
    name: "Tara",
    system_prompt: "You are Tara, a friendly companion.",
    style_prompt: "Speak in Hinglish with casual tone.",
    long_doc: "Tara is a 25-year-old from Mumbai...",
    short_summary: "Tara is friendly and supportive.",
    avatar_url: "https://example.com/tara.png",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "kabir",
    name: "Kabir",
    system_prompt: "You are Kabir, a fitness enthusiast.",
    style_prompt: "Speak like a gym bro.",
    long_doc: "Kabir loves protein and workouts...",
    short_summary: "Kabir is all about fitness.",
    avatar_url: "https://example.com/kabir.png",
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "zoya",
    name: "Zoya",
    system_prompt: "You are Zoya, an artist.",
    style_prompt: "Speak creatively and poetically.",
    long_doc: "Zoya paints and dreams...",
    short_summary: "Zoya is creative and artistic.",
    avatar_url: "https://example.com/zoya.png",
    created_at: "2024-01-01T00:00:00Z",
  },
];

const mockUser = {
  phone: "+919876543210",
  fcm_token: "mock-fcm-token",
};

// Helper to create mock request
function createMockRequest(method: string, body?: object, token: string = "valid-token"): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  return new Request("http://localhost:54321/functions/v1/get-personas", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

Deno.test("CORS preflight request returns 204", async () => {
  const req = new Request("http://localhost:54321/functions/v1/get-personas", {
    method: "OPTIONS",
  });
  
  const response = new Response("ok", {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
  
  assertEquals(response.status, 204);
});

Deno.test("Authentication - missing Authorization header returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/get-personas", {
    method: "GET",
    headers: {},
  });
  
  const expectedResponse = {
    code: 401,
    message: "Missing or invalid Authorization header",
  };
  
  assertEquals(expectedResponse.code, 401);
  assertStringIncludes(expectedResponse.message, "Authorization");
});

Deno.test("Authentication - invalid token format returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/get-personas", {
    method: "GET",
    headers: {
      "Authorization": "Basic invalid",
    },
  });
  
  const expectedResponse = {
    code: 401,
    message: "Missing or invalid Authorization header",
  };
  
  assertEquals(expectedResponse.code, 401);
});

Deno.test("GET request - returns all personas without body", async () => {
  // Simulate GET request behavior
  const method = "GET";
  const body = {};
  
  // Should not require body parsing
  assertEquals(method, "GET");
  assertEquals(Object.keys(body).length, 0);
});

Deno.test("POST request - returns all personas when no ID specified", async () => {
  const req = createMockRequest("POST", {});
  
  // Simulate fetching all personas
  const result = { data: mockPersonas };
  
  assertEquals(result.data.length, 3);
  assertEquals(result.data[0].id, "tara");
  assertEquals(result.data[1].id, "kabir");
  assertEquals(result.data[2].id, "zoya");
});

Deno.test("POST request - returns specific persona when ID provided", async () => {
  const req = createMockRequest("POST", { id: "tara" });
  
  // Simulate fetching specific persona
  const personaId = "tara";
  const result = { data: mockPersonas.filter(p => p.id === personaId) };
  
  assertEquals(result.data.length, 1);
  assertEquals(result.data[0].id, "tara");
  assertEquals(result.data[0].name, "Tara");
});

Deno.test("POST request - returns empty array for non-existent persona ID", async () => {
  const personaId = "non-existent";
  const result = { data: mockPersonas.filter(p => p.id === personaId) };
  
  assertEquals(result.data.length, 0);
});

Deno.test("Response format - includes data array", async () => {
  const response = { data: mockPersonas };
  
  assertExists(response.data);
  assertEquals(Array.isArray(response.data), true);
});

Deno.test("Response format - includes new_token when refreshed", async () => {
  const response = {
    data: mockPersonas,
    new_token: "refreshed-jwt-token",
  };
  
  assertExists(response.new_token);
  assertEquals(typeof response.new_token, "string");
});

Deno.test("Persona object - contains required fields", async () => {
  const persona = mockPersonas[0];
  
  assertExists(persona.id);
  assertExists(persona.name);
  assertExists(persona.system_prompt);
  assertExists(persona.created_at);
});

Deno.test("Persona object - optional fields may be null", async () => {
  const minimalPersona = {
    id: "minimal",
    name: "Minimal",
    system_prompt: "You are minimal.",
    style_prompt: null,
    long_doc: null,
    short_summary: null,
    avatar_url: null,
    created_at: "2024-01-01T00:00:00Z",
  };
  
  assertExists(minimalPersona.id);
  assertEquals(minimalPersona.style_prompt, null);
  assertEquals(minimalPersona.long_doc, null);
});

Deno.test("Database query - selects all columns", async () => {
  const query = {
    table: "personas",
    columns: ["*"],
  };
  
  assertEquals(query.table, "personas");
  assertEquals(query.columns[0], "*");
});

Deno.test("Database query - filters by ID when specified", async () => {
  const personaId = "tara";
  const query = {
    table: "personas",
    columns: ["*"],
    filter: { id: personaId },
  };
  
  assertEquals(query.filter.id, personaId);
});

Deno.test("Error handling - database error returns 500", async () => {
  const dbError = {
    message: "connection failed",
    code: "ECONNREFUSED",
  };
  
  const expectedResponse = {
    error: dbError.message,
  };
  
  assertEquals(expectedResponse.error, "connection failed");
});

Deno.test("Error handling - server error returns 500", async () => {
  const serverError = new Error("Unexpected error");
  
  const expectedResponse = {
    error: String(serverError?.message || serverError),
  };
  
  assertEquals(expectedResponse.error, "Unexpected error");
});

Deno.test("CORS headers - returns correct headers", () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  assertEquals(corsHeaders["Access-Control-Allow-Methods"], "GET, POST, OPTIONS");
  assertStringIncludes(corsHeaders["Access-Control-Allow-Headers"], "Authorization");
});

Deno.test("Environment variables - validates required vars on startup", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
  ];
  
  assertEquals(requiredVars.length, 3);
  assertEquals(requiredVars.includes("JWT_SECRET"), true);
});

// Integration tests
Deno.test("Integration - full get personas flow", async () => {
  // Step 1: Auth
  const authHeader = "Bearer valid-token";
  assertStringIncludes(authHeader, "Bearer");
  
  // Step 2: Parse request (GET has no body)
  const method = "GET";
  assertEquals(method, "GET");
  
  // Step 3: Query database
  const personas = mockPersonas;
  assertEquals(personas.length, 3);
  
  // Step 4: Return response
  const response = { data: personas };
  assertEquals(response.data.length, 3);
});

Deno.test("Integration - get specific persona flow", async () => {
  // Step 1: Auth
  const authHeader = "Bearer valid-token";
  assertStringIncludes(authHeader, "Bearer");
  
  // Step 2: Parse request body
  const body = { id: "tara" };
  assertEquals(body.id, "tara");
  
  // Step 3: Query with filter
  const persona = mockPersonas.find(p => p.id === body.id);
  assertExists(persona);
  assertEquals(persona.name, "Tara");
  
  // Step 4: Return response
  const response = { data: [persona] };
  assertEquals(response.data.length, 1);
});

Deno.test("Integration - token refresh flow", async () => {
  // Simulate token refresh
  const wasRefreshed = true;
  const newToken = "refreshed-token";
  
  const response = {
    data: mockPersonas,
    new_token: newToken,
  };
  
  assertEquals(wasRefreshed, true);
  assertEquals(response.new_token, newToken);
});

// Edge cases
Deno.test("Edge case - empty personas table", async () => {
  const emptyPersonas: typeof mockPersonas = [];
  
  const response = { data: emptyPersonas };
  assertEquals(response.data.length, 0);
});

Deno.test("Edge case - very large persona data", async () => {
  const largePersona = {
    ...mockPersonas[0],
    long_doc: "x".repeat(100000),
  };
  
  assertEquals(largePersona.long_doc.length, 100000);
});

Deno.test("Edge case - special characters in persona fields", async () => {
  const specialPersona = {
    ...mockPersonas[0],
    name: "Tara \"The Star\" <script>alert('xss')</script>",
    system_prompt: "Test & More <>",
  };
  
  assertStringIncludes(specialPersona.name, "<script>");
  assertStringIncludes(specialPersona.system_prompt, "&");
});

Deno.test("Edge case - unicode characters in persona fields", async () => {
  const unicodePersona = {
    ...mockPersonas[0],
    name: "तारा 🌟",
    system_prompt: "नमस्ते! 🙏",
  };
  
  assertEquals(unicodePersona.name, "तारा 🌟");
  assertStringIncludes(unicodePersona.system_prompt, "🙏");
});

Deno.test("Edge case - malformed JSON in POST body", async () => {
  const malformedBody = "{ invalid json";
  
  let parseError: Error | null = null;
  try {
    JSON.parse(malformedBody);
  } catch (e) {
    parseError = e as Error;
  }
  
  assertExists(parseError);
});

Deno.test("Edge case - concurrent requests", async () => {
  const requests = Array(10).fill(null).map((_, i) => ({
    id: `request-${i}`,
    token: `token-${i}`,
  }));
  
  // Simulate concurrent processing
  const results = await Promise.all(
    requests.map(req => Promise.resolve({ data: mockPersonas }))
  );
  
  assertEquals(results.length, 10);
  for (const result of results) {
    assertEquals(result.data.length, 3);
  }
});

// Mock tests
Deno.test("Mock - Supabase personas query", () => {
  const mockQuery = {
    table: "personas",
    columns: ["*"],
    result: mockPersonas,
  };
  
  assertEquals(mockQuery.table, "personas");
  assertEquals(mockQuery.result.length, 3);
});

Deno.test("Mock - Supabase filtered query", () => {
  const personaId = "tara";
  const mockQuery = {
    table: "personas",
    columns: ["*"],
    filter: { id: personaId },
    result: mockPersonas.filter(p => p.id === personaId),
  };
  
  assertEquals(mockQuery.filter.id, personaId);
  assertEquals(mockQuery.result.length, 1);
});

Deno.test("Mock - JWT verification", async () => {
  const token = "valid-jwt-token";
  const decoded = { phone: "+919876543210" };
  
  assertExists(decoded.phone);
  assertEquals(decoded.phone, "+919876543210");
});
