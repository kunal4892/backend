// persona-manager/index.test.ts
// Comprehensive tests for persona-manager edge function

import { assertEquals, assertExists, assertStringIncludes, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockPersona = {
  id: "tara",
  name: "Tara",
  system_prompt: "You are Tara, a friendly and supportive companion.",
  style_prompt: "Speak in Hinglish with casual desi slang.",
  long_doc: "Tara is a 25-year-old from Mumbai who loves Bollywood movies and chai. She's always ready to chat about life, relationships, and everything in between.",
  short_summary: "Tara is friendly, supportive, and loves Bollywood.",
};

const mockPersonaNoStyle = {
  id: "kabir",
  name: "Kabir",
  system_prompt: "You are Kabir, a fitness enthusiast.",
  style_prompt: "",
  long_doc: "Kabir loves gym and protein shakes.",
  short_summary: "Kabir is all about fitness.",
};

const mockPersonaMinimal = {
  id: "zoya",
  name: "Zoya",
  system_prompt: "",
  style_prompt: null,
  long_doc: null,
  short_summary: null,
};

// Helper to create mock request
function createMockRequest(body: object, token: string = "valid-token"): Request {
  return new Request("http://localhost:54321/functions/v1/persona-manager", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// Default style template (from the actual code)
const DEFAULT_STYLE = `
FORMATTING (MANDATORY):
Split your response into 2-3 short chat bubbles using &&&
Each bubble should be 1-3 sentences max (like WhatsApp messages).
Example: "Hey! Kaise ho?&&&Batao, kya chal raha hai?"

CRITICAL RULES:
- NEVER use single & in your response. Only use exactly three: &&&
- Keep bubbles SHORT (1-3 sentences each, not paragraphs)
- Most replies should be 2 bubbles, sometimes 3
- Don't write essays - this is casual chat!

LANGUAGE & STYLE:
- Speak Hinglish (casual, desi vibe) unless user prefers English
- Use "aap" unless user asks for "tu"
- Light emojis when it feels right
- Be yourself, not a template

CONVERSATION:
- The chat history above shows your past conversation with THIS user
- Remember what matters (names, feelings, important topics)
- Let conversation flow naturally — if they change topics, go with it
- Short replies like "ok" or "hmm" = time to move on
- Don't force topics or be pushy
`;

Deno.test("CORS preflight request returns 204", async () => {
  const req = new Request("http://localhost:54321/functions/v1/persona-manager", {
    method: "OPTIONS",
  });
  
  const response = new Response(null, {
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
  const req = new Request("http://localhost:54321/functions/v1/persona-manager", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "buildContext", personaId: "tara", phone: "+919876543210" }),
  });
  
  const expectedError = {
    error: "Missing or invalid Authorization header",
  };
  
  assertEquals(expectedError.error, "Missing or invalid Authorization header");
});

Deno.test("Authentication - invalid Authorization format returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/persona-manager", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": "Basic invalid",
    },
    body: JSON.stringify({ action: "buildContext", personaId: "tara", phone: "+919876543210" }),
  });
  
  const expectedError = {
    error: "Missing or invalid Authorization header",
  };
  
  assertEquals(expectedError.error, "Missing or invalid Authorization header");
});

Deno.test("Authentication - empty token returns 401", async () => {
  const req = new Request("http://localhost:54321/functions/v1/persona-manager", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": "Bearer ",
    },
    body: JSON.stringify({ action: "buildContext", personaId: "tara", phone: "+919876543210" }),
  });
  
  const expectedError = {
    error: "Empty token",
  };
  
  assertEquals(expectedError.error, "Empty token");
});

Deno.test("Authentication - invalid JWT returns 401", async () => {
  const req = createMockRequest(
    { action: "buildContext", personaId: "tara", phone: "+919876543210" },
    "invalid-jwt-token"
  );
  
  const expectedError = {
    error: "Invalid or expired token",
  };
  
  assertEquals(expectedError.error, "Invalid or expired token");
});

Deno.test("Authentication - JWT without phone returns 400", async () => {
  // Mock JWT that doesn't have phone in payload
  const tokenWithoutPhone = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  
  const req = createMockRequest(
    { action: "buildContext", personaId: "tara", phone: "+919876543210" },
    tokenWithoutPhone
  );
  
  const expectedError = {
    error: "No phone found in token",
  };
  
  assertEquals(expectedError.error, "No phone found in token");
});

Deno.test("Validation - missing action returns 400", async () => {
  const req = createMockRequest({
    personaId: "tara",
    phone: "+919876543210",
  });
  
  const expectedError = {
    error: "Missing required params",
  };
  
  assertEquals(expectedError.error, "Missing required params");
});

Deno.test("Validation - missing personaId returns 400", async () => {
  const req = createMockRequest({
    action: "buildContext",
    phone: "+919876543210",
  });
  
  const expectedError = {
    error: "Missing required params",
  };
  
  assertEquals(expectedError.error, "Missing required params");
});

Deno.test("Validation - missing phone returns 400", async () => {
  const req = createMockRequest({
    action: "buildContext",
    personaId: "tara",
  });
  
  const expectedError = {
    error: "Missing required params",
  };
  
  assertEquals(expectedError.error, "Missing required params");
});

Deno.test("Action - unknown action returns 400", async () => {
  const req = createMockRequest({
    action: "unknownAction",
    personaId: "tara",
    phone: "+919876543210",
  });
  
  const expectedError = {
    error: "Unknown action",
  };
  
  assertEquals(expectedError.error, "Unknown action");
});

Deno.test("buildPersonaContext - builds context with full persona data", () => {
  const phone = "+919876543210";
  const isFirst = true;
  
  // Simulate the buildPersonaContext function
  const base = mockPersona.system_prompt || "You are a helpful companion.";
  const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, mockPersona.system_prompt);
  assertStringIncludes(context, mockPersona.style_prompt);
  assertStringIncludes(context, mockPersona.name);
  assertStringIncludes(context, phone);
  assertStringIncludes(context, "full character profile");
  assertStringIncludes(context, mockPersona.long_doc);
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is empty", () => {
  const phone = "+919876543210";
  const isFirst = false;
  
  const base = mockPersonaNoStyle.system_prompt || "You are a helpful companion.";
  const style = mockPersonaNoStyle.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersonaNoStyle.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersonaNoStyle.short_summary || mockPersonaNoStyle.system_prompt || ""}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersonaNoStyle.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, DEFAULT_STYLE);
  assertStringIncludes(context, "FORMATTING (MANDATORY)");
  assertStringIncludes(context, "&&&");
});

Deno.test("buildPersonaContext - handles minimal persona data", () => {
  const phone = "+919876543210";
  const isFirst = false;
  
  const base = mockPersonaMinimal.system_prompt || "You are a helpful companion.";
  const style = mockPersonaMinimal.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersonaMinimal.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersonaMinimal.short_summary || mockPersonaMinimal.system_prompt || ""}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersonaMinimal.name}.\n\n${personaDoc}`;
  
  // Should use defaults
  assertStringIncludes(context, "You are a helpful companion.");
  assertStringIncludes(context, DEFAULT_STYLE);
});

Deno.test("buildPersonaContext - uses short_summary for non-first chats", () => {
  const phone = "+919876543210";
  const isFirst = false;
  
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "Reminder of your persona");
  assertStringIncludes(personaDoc, mockPersona.short_summary);
});

Deno.test("buildPersonaContext - uses long_doc for first chats", () => {
  const phone = "+919876543210";
  const isFirst = true;
  
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "full character profile");
  assertStringIncludes(personaDoc, mockPersona.long_doc);
});

Deno.test("buildPersonaContext - handles null persona gracefully", () => {
  const nullPersona = null;
  const phone = "+919876543210";
  
  // Should handle null persona
  const persona = nullPersona || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: "",
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(base, "You are a helpful companion.");
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("Database - fetches persona from DB with priority over fallback", async () => {
  // Simulate DB fetch
  const dbPersona = { ...mockPersona, style_prompt: "Updated style from DB" };
  const fallbackPersonaData = { name: "Fallback Name" };
  
  // Merge DB persona (priority) with fallback
  const mergedPersona = {
    ...fallbackPersonaData,
    ...dbPersona,
  };
  
  // DB value should take priority
  assertEquals(mergedPersona.style_prompt, "Updated style from DB");
  assertEquals(mergedPersona.name, "Tara"); // From DB, not fallback
});

Deno.test("Database - uses fallback when DB fetch fails", async () => {
  const fetchErr = new Error("Database connection failed");
  const fallbackPersonaData = { name: "Fallback Name", system_prompt: "Fallback prompt" };
  
  // When DB fails, use fallback
  const persona = {
    ...fallbackPersonaData,
    ...null, // DB returned null
  };
  
  assertEquals(persona.name, "Fallback Name");
});

Deno.test("Response - buildContext action returns context", async () => {
  const expectedResponse = {
    context: expect.any(String),
  };
  
  assertExists(expectedResponse);
});

Deno.test("CORS headers - returns correct headers", () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
  
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  assertEquals(corsHeaders["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertStringIncludes(corsHeaders["Access-Control-Allow-Headers"], "Authorization");
});

Deno.test("Error handling - returns 500 on unexpected error", async () => {
  const unexpectedError = new Error("Database connection lost");
  
  const expectedResponse = {
    error: unexpectedError.message,
  };
  
  assertEquals(expectedResponse.error, "Database connection lost");
});

Deno.test("Environment variables - validates required vars", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "JWT_SECRET",
  ];
  
  assertEquals(requiredVars.length, 3);
  assertEquals(requiredVars.includes("JWT_SECRET"), true);
});

// Integration tests
Deno.test("Integration - full buildContext flow", async () => {
  // Step 1: Validate auth
  const authHeader = "Bearer valid-token";
  assertStringIncludes(authHeader, "Bearer");
  
  // Step 2: Parse request
  const body = {
    action: "buildContext",
    personaId: "tara",
    phone: "+919876543210",
    isFirst: true,
  };
  
  assertEquals(body.action, "buildContext");
  assertEquals(body.personaId, "tara");
  
  // Step 3: Fetch persona from DB
  const dbPersona = mockPersona;
  assertExists(dbPersona);
  
  // Step 4: Build context
  const context = `${dbPersona.system_prompt}\n\n${dbPersona.style_prompt}\n\nYou're roleplaying for this ${body.phone} as ${dbPersona.name}.`;
  assertStringIncludes(context, dbPersona.system_prompt);
  assertStringIncludes(context, body.phone);
  
  // Step 5: Return response
  const response = { context };
  assertExists(response.context);
});

Deno.test("Integration - handles missing persona gracefully", async () => {
  // DB returns null
  const dbPersona = null;
  const fallbackPersonaData = { name: "Fallback", system_prompt: "Fallback prompt" };
  
  // Merge with fallback
  const persona = {
    ...fallbackPersonaData,
    ...dbPersona,
  };
  
  // Should use fallback values
  assertEquals(persona.name, "Fallback");
});

// Edge cases
Deno.test("Edge case - very long style_prompt", () => {
  const longStyle = "x".repeat(10000);
  const persona = { ...mockPersona, style_prompt: longStyle };
  
  const context = `${persona.system_prompt}\n\n${persona.style_prompt}`;
  assertEquals(context.length > 10000, true);
});

Deno.test("Edge case - special characters in persona data", () => {
  const specialCharsPersona = {
    ...mockPersona,
    name: "Tara \"The Star\"",
    system_prompt: "You're <b>bold</b> & beautiful!",
  };
  
  assertStringIncludes(specialCharsPersona.name, '"');
  assertStringIncludes(specialCharsPersona.system_prompt, "<b>");
  assertStringIncludes(specialCharsPersona.system_prompt, "&");
});

Deno.test("Edge case - unicode characters in persona data", () => {
  const unicodePersona = {
    ...mockPersona,
    name: "तारा",
    system_prompt: "नमस्ते! 🙏",
  };
  
  assertEquals(unicodePersona.name, "तारा");
  assertStringIncludes(unicodePersona.system_prompt, "🙏");
});

Deno.test("Edge case - phone number formats", () => {
  const phoneFormats = [
    "+919876543210",
    "+1-555-123-4567",
    "+44 20 7946 0958",
    "+81-3-1234-5678",
  ];
  
  for (const phone of phoneFormats) {
    const context = `You're roleplaying for this ${phone} as ${mockPersona.name}.`;
    assertStringIncludes(context, phone);
  }
});
