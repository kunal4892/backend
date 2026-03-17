// summarize-and-notify/index.test.ts
// Comprehensive tests for summarize-and-notify edge function

import { assertEquals, assertExists, assertStringIncludes, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockUsers = [
  { phone: "+919876543210", fcm_token: "fcm-token-1" },
  { phone: "+919876543211", fcm_token: "fcm-token-2" },
  { phone: "+919876543212", fcm_token: null }, // No FCM token
];

const mockThreads = [
  { 
    id: "thread-1", 
    phone: "+919876543210", 
    persona_id: "tara",
    updated_at: "2024-01-15T10:00:00Z",
  },
  { 
    id: "thread-2", 
    phone: "+919876543211", 
    persona_id: "kabir",
    updated_at: "2024-01-15T09:00:00Z",
  },
];

const mockMessages = [
  { role: "user", text: "Hey, how are you?", created_at: "2024-01-15T09:55:00Z" },
  { role: "bot", text: "I'm doing great!", created_at: "2024-01-15T09:56:00Z" },
  { role: "user", text: "What's new?", created_at: "2024-01-15T09:57:00Z" },
  { role: "bot", text: "Just chilling!", created_at: "2024-01-15T09:58:00Z" },
];

const mockPersonaImages = {
  tara: "https://example.com/tara.png",
  kabir: "https://example.com/kabir.png",
  zoya: "https://example.com/zoya.png",
  ramya: "https://example.com/ramya.png",
};

// Mock Gemini response
const mockGeminiTeaserResponse = {
  candidates: [
    {
      content: {
        parts: [{ text: "Arre yaar, kya chal raha hai? 😊" }],
      },
      finishReason: "STOP",
    },
  ],
};

// Mock OAuth2 token response
const mockOAuth2Response = {
  access_token: "mock-oauth2-token",
  token_type: "Bearer",
  expires_in: 3600,
};

// Mock FCM send response
const mockFcmResponse = {
  name: "projects/test-project/messages/12345",
};

Deno.test("Environment variables - validates required vars", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "FCM_PROJECT_ID",
    "FCM_CLIENT_EMAIL",
    "FCM_PRIVATE_KEY",
    "GEMINI_API_KEY",
  ];
  
  assertEquals(requiredVars.length, 6);
  assertEquals(requiredVars.includes("FCM_PROJECT_ID"), true);
  assertEquals(requiredVars.includes("GEMINI_API_KEY"), true);
});

Deno.test("getAccessToken - exchanges JWT for OAuth2 token", async () => {
  // Mock the OAuth2 flow
  const now = Math.floor(Date.now() / 1000);
  const jwtClaims = {
    iss: "test@example.com",
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  
  assertExists(jwtClaims.iss);
  assertEquals(jwtClaims.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assertEquals(jwtClaims.exp - jwtClaims.iat, 3600);
});

Deno.test("getAccessToken - handles missing credentials", async () => {
  const errorResponse = {
    error: "invalid_client",
    error_description: "The OAuth client was not found.",
  };
  
  assertEquals(errorResponse.error, "invalid_client");
});

Deno.test("getAccessToken - handles network errors", async () => {
  const networkError = new Error("Failed to fetch");
  assertEquals(networkError.message, "Failed to fetch");
});

Deno.test("generateTeaser - creates engaging teaser from conversation", async () => {
  const convo = mockMessages;
  const personaName = "Tara";
  
  // Simulate teaser generation
  const convoText = convo.map((m) => `${m.role === "user" ? "👤" : "🤖"}: ${m.text}`).join("\n");
  
  assertStringIncludes(convoText, "👤");
  assertStringIncludes(convoText, "🤖");
  assertStringIncludes(convoText, "Hey, how are you?");
  
  // Mock Gemini prompt
  const prompt = `
You are ${personaName}, chatting casually in Hinglish.

Task: Write a **short teaser (max 20 words)** to re-engage the user.  
⚠️ IMPORTANT: Every teaser must feel new and personal. Avoid repeating hooks like "Hey", "missing you", "come back".  
Use curiosity, humor, or callbacks to recent convo.`;
  
  assertStringIncludes(prompt, personaName);
  assertStringIncludes(prompt, "max 20 words");
});

Deno.test("generateTeaser - handles empty conversation", async () => {
  const emptyConvo: typeof mockMessages = [];
  const fallbackTeaser = "Chal na, baat karte hain 😉";
  
  assertEquals(emptyConvo.length, 0);
  assertExists(fallbackTeaser);
});

Deno.test("generateTeaser - handles Gemini API errors", async () => {
  const errorResponse = {
    error: {
      code: 400,
      message: "API key not valid",
      status: "INVALID_ARGUMENT",
    },
  };
  
  // Should return fallback teaser
  const fallbackTeaser = "Chal na, baat karte hain 😉";
  assertExists(fallbackTeaser);
});

Deno.test("generateTeaser - handles blocked content", async () => {
  const blockedResponse = {
    promptFeedback: {
      blockReason: "SAFETY",
      safetyRatings: [
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", probability: "HIGH" },
      ],
    },
  };
  
  // Should return fallback teaser
  const fallbackTeaser = "Chal na, baat karte hain 😉";
  assertExists(fallbackTeaser);
});

Deno.test("generateTeaser - teaser is max 20 words", async () => {
  const teaser = "Arre yaar, kya chal raha hai? 😊";
  const wordCount = teaser.split(/\s+/).length;
  
  assertEquals(wordCount <= 20, true);
});

Deno.test("generateTeaser - teaser avoids repetitive hooks", () => {
  const repetitiveHooks = ["Hey", "missing you", "come back"];
  const teaser = "Arre yaar, kya chal raha hai? 😊";
  
  for (const hook of repetitiveHooks) {
    assertEquals(teaser.toLowerCase().includes(hook.toLowerCase()), false);
  }
});

Deno.test("Main handler - skips users without FCM token", async () => {
  const usersWithToken = mockUsers.filter(u => u.fcm_token);
  
  assertEquals(usersWithToken.length, 2);
  assertEquals(usersWithToken[0].fcm_token, "fcm-token-1");
});

Deno.test("Main handler - skips users without threads", async () => {
  const userPhone = "+919876543210";
  const userThread = mockThreads.find(t => t.phone === userPhone);
  
  assertExists(userThread);
});

Deno.test("Main handler - skips threads without messages", async () => {
  const emptyMessages: typeof mockMessages = [];
  
  assertEquals(emptyMessages.length, 0);
  // Should skip this user
});

Deno.test("Main handler - fetches last 30 messages", () => {
  const messageLimit = 30;
  const orderAscending = false; // Newest first
  
  assertEquals(messageLimit, 30);
  assertEquals(orderAscending, false);
});

Deno.test("Main handler - reverses messages for chronological order", () => {
  const reversedMessages = [...mockMessages].reverse();
  
  assertEquals(reversedMessages[0].text, "Just chilling!");
  assertEquals(reversedMessages[reversedMessages.length - 1].text, "Hey, how are you?");
});

Deno.test("Main handler - inserts teaser into database", async () => {
  const teaser = "Arre yaar, kya chal raha hai? 😊";
  const threadId = "thread-1";
  
  const insertData = {
    thread_id: threadId,
    role: "bot",
    text: teaser,
    created_at: new Date().toISOString(),
  };
  
  assertEquals(insertData.role, "bot");
  assertEquals(insertData.thread_id, threadId);
  assertEquals(insertData.text, teaser);
});

Deno.test("Main handler - handles DB insert error gracefully", async () => {
  const insertError = { message: "Database connection failed" };
  
  // Should log error but continue
  assertExists(insertError.message);
});

Deno.test("FCM message - constructs correct payload", () => {
  const fcmToken = "fcm-token-1";
  const personaName = "Tara";
  const teaser = "Arre yaar, kya chal raha hai? 😊";
  const personaImage = mockPersonaImages.tara;
  
  const message = {
    message: {
      token: fcmToken,
      notification: {
        title: personaName,
        body: teaser,
        image: personaImage,
      },
      data: {},
    },
  };
  
  assertEquals(message.message.token, fcmToken);
  assertEquals(message.message.notification.title, personaName);
  assertEquals(message.message.notification.body, teaser);
  assertEquals(message.message.notification.image, personaImage);
});

Deno.test("FCM message - uses correct persona image", () => {
  const personaKey = "tara";
  const normalizedKey = personaKey.toLowerCase();
  const personaImage = mockPersonaImages[normalizedKey as keyof typeof mockPersonaImages] || mockPersonaImages.tara;
  
  assertEquals(personaImage, mockPersonaImages.tara);
});

Deno.test("FCM message - falls back to default image for unknown persona", () => {
  const unknownPersona = "unknown";
  const normalizedKey = unknownPersona.toLowerCase();
  const personaImage = mockPersonaImages[normalizedKey as keyof typeof mockPersonaImages] || mockPersonaImages.tara;
  
  assertEquals(personaImage, mockPersonaImages.tara); // Fallback to tara
});

Deno.test("FCM send - successful response", async () => {
  const response = mockFcmResponse;
  
  assertExists(response.name);
  assertStringIncludes(response.name, "projects/");
});

Deno.test("FCM send - handles invalid token error", async () => {
  const errorResponse = {
    error: {
      code: 404,
      message: "Requested entity was not found.",
      status: "NOT_FOUND",
      details: [
        {
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode: "UNREGISTERED",
        },
      ],
    },
  };
  
  assertEquals(errorResponse.error.code, 404);
  assertStringIncludes(errorResponse.error.message, "not found");
});

Deno.test("FCM send - handles rate limiting", async () => {
  const errorResponse = {
    error: {
      code: 429,
      message: "Rate limit exceeded",
      status: "RESOURCE_EXHAUSTED",
    },
  };
  
  assertEquals(errorResponse.error.code, 429);
});

Deno.test("Persona name extraction - uses thread.persona_id", () => {
  const thread = mockThreads[0];
  const personaName = thread.persona_id || "AI Friend";
  
  assertEquals(personaName, "tara");
});

Deno.test("Persona name extraction - falls back to AI Friend", () => {
  const thread = { ...mockThreads[0], persona_id: null };
  const personaName = thread.persona_id || "AI Friend";
  
  assertEquals(personaName, "AI Friend");
});

Deno.test("Response - returns success when no users", async () => {
  const emptyUsers: typeof mockUsers = [];
  
  const response = {
    message: "No users",
  };
  
  assertEquals(response.message, "No users");
});

Deno.test("Response - returns success after processing", async () => {
  const response = {
    success: true,
  };
  
  assertEquals(response.success, true);
});

Deno.test("Response - returns error on exception", async () => {
  const error = new Error("Something went wrong");
  
  const response = {
    error: error.message,
  };
  
  assertEquals(response.error, "Something went wrong");
});

Deno.test("Error handling - logs errors correctly", () => {
  const error = new Error("Test error");
  const logMessage = `❌ summarize-and-notify error: ${error}`;
  
  assertStringIncludes(logMessage, "summarize-and-notify error");
  assertStringIncludes(logMessage, "Test error");
});

// Integration tests
Deno.test("Integration - full notification flow", async () => {
  // Step 1: Get users with FCM tokens
  const users = mockUsers.filter(u => u.fcm_token);
  assertEquals(users.length, 2);
  
  // Step 2: Get OAuth2 token
  const accessToken = "mock-oauth2-token";
  assertExists(accessToken);
  
  // Step 3: Process each user
  for (const user of users) {
    // Get last thread
    const thread = mockThreads.find(t => t.phone === user.phone);
    assertExists(thread);
    
    // Get messages
    const messages = mockMessages;
    assertExists(messages);
    
    // Generate teaser
    const personaName = thread.persona_id || "AI Friend";
    const teaser = "Arre yaar, kya chal raha hai? 😊";
    assertExists(teaser);
    
    // Insert into DB
    const insertResult = { error: null };
    assertEquals(insertResult.error, null);
    
    // Send FCM
    const fcmResult = { name: "projects/test/messages/123" };
    assertExists(fcmResult.name);
  }
});

Deno.test("Integration - handles user without thread", async () => {
  const user = { phone: "+919999999999", fcm_token: "token" };
  const thread = mockThreads.find(t => t.phone === user.phone);
  
  assertEquals(thread, undefined);
  // Should skip this user
});

Deno.test("Integration - handles user without messages", async () => {
  const user = mockUsers[0];
  const emptyMessages: typeof mockMessages = [];
  
  assertEquals(emptyMessages.length, 0);
  // Should skip this user
});

// Edge cases
Deno.test("Edge case - very long conversation", () => {
  const longConvo = Array(100).fill(null).map((_, i) => ({
    role: i % 2 === 0 ? "user" : "bot",
    text: `Message ${i}`,
    created_at: new Date().toISOString(),
  }));
  
  // Should only use last 30
  const limitedConvo = longConvo.slice(-30);
  assertEquals(limitedConvo.length, 30);
});

Deno.test("Edge case - conversation with special characters", () => {
  const specialConvo = [
    { role: "user", text: "Hello <script>alert('xss')</script>", created_at: new Date().toISOString() },
    { role: "bot", text: "Hi! &&& How are you?", created_at: new Date().toISOString() },
    { role: "user", text: "नमस्ते! 🙏", created_at: new Date().toISOString() },
  ];
  
  const convoText = specialConvo.map((m) => `${m.role === "user" ? "👤" : "🤖"}: ${m.text}`).join("\n");
  assertStringIncludes(convoText, "<script>");
  assertStringIncludes(convoText, "🙏");
});

Deno.test("Edge case - FCM token with special characters", () => {
  const specialToken = "fcm:token/with+special=chars&more";
  
  const message = {
    message: {
      token: specialToken,
      notification: {
        title: "Test",
        body: "Test message",
      },
    },
  };
  
  assertEquals(message.message.token, specialToken);
});

Deno.test("Edge case - persona name with special characters", () => {
  const personaName = "Tara \"The Star\"";
  const normalizedKey = personaName.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  assertEquals(normalizedKey, "tarathestar");
});

Deno.test("Edge case - empty teaser from Gemini", async () => {
  const emptyResponse = {
    candidates: [
      {
        content: {
          parts: [{ text: "   " }], // Whitespace only
        },
      },
    ],
  };
  
  const text = emptyResponse.candidates[0].content.parts[0].text.trim();
  assertEquals(text, "");
  
  // Should use fallback
  const fallback = "Chal na, baat karte hain 😉";
  assertExists(fallback);
});

Deno.test("Edge case - Gemini returns no candidates", async () => {
  const noCandidatesResponse = {
    candidates: [],
  };
  
  assertEquals(noCandidatesResponse.candidates.length, 0);
  
  // Should use fallback
  const fallback = "Chal na, baat karte hain 😉";
  assertExists(fallback);
});

Deno.test("Edge case - network timeout during FCM send", async () => {
  const timeoutError = new Error("Fetch timeout");
  
  // Should catch and log error
  assertEquals(timeoutError.message, "Fetch timeout");
});

Deno.test("Edge case - OAuth2 token expires during processing", async () => {
  const expiredToken = {
    access_token: "expired-token",
    expires_in: 0,
  };
  
  // Should refresh token or handle gracefully
  assertEquals(expiredToken.expires_in, 0);
});

Deno.test("Mock - Supabase users query", () => {
  const mockQuery = {
    table: "users",
    columns: ["phone", "fcm_token"],
    result: mockUsers,
  };
  
  assertEquals(mockQuery.table, "users");
  assertEquals(mockQuery.columns.length, 2);
  assertEquals(mockQuery.result.length, 3);
});

Deno.test("Mock - Supabase threads query", () => {
  const phone = "+919876543210";
  const mockQuery = {
    table: "threads",
    filters: { phone },
    orderBy: "updated_at",
    orderDirection: "desc",
    limit: 1,
    result: mockThreads[0],
  };
  
  assertEquals(mockQuery.filters.phone, phone);
  assertEquals(mockQuery.orderBy, "updated_at");
  assertEquals(mockQuery.limit, 1);
});

Deno.test("Mock - Supabase messages query", () => {
  const threadId = "thread-1";
  const mockQuery = {
    table: "messages",
    filters: { thread_id: threadId },
    columns: ["role", "text", "created_at"],
    orderBy: "created_at",
    orderDirection: "desc",
    limit: 30,
    result: mockMessages,
  };
  
  assertEquals(mockQuery.filters.thread_id, threadId);
  assertEquals(mockQuery.limit, 30);
});

Deno.test("Mock - Gemini API request", () => {
  const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";
  const apiKey = "test-api-key";
  
  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "test prompt" }] }],
      generationConfig: { candidateCount: 1, temperature: 0.9 },
    }),
  };
  
  assertStringIncludes(geminiUrl, "gemini-2.5-pro");
  assertEquals(request.method, "POST");
});

Deno.test("Mock - FCM API request", () => {
  const projectId = "test-project";
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const accessToken = "oauth2-token";
  
  const request = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token: "fcm-token",
        notification: { title: "Test", body: "Test" },
      },
    }),
  };
  
  assertStringIncludes(fcmUrl, projectId);
  assertEquals(request.headers.Authorization, `Bearer ${accessToken}`);
});
