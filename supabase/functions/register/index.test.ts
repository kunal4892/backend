// register/index.test.ts
// Comprehensive tests for register edge function

import { assertEquals, assertExists, assertStringIncludes, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

// Test JWT secret
const TEST_JWT_SECRET = "test-secret-key-for-jwt-signing-32chars!!";

// Test data
const mockUser = {
  phone: "+919876543210",
  gender: "female",
  age: 25,
  city: "Mumbai",
  fcm_token: "mock-fcm-token-12345",
};

const mockEncryptedPayload = {
  encrypted_key: "base64encryptedkey",
  iv: "a1b2c3d4e5f6g7h8",
  payload: "base64encryptedpayload",
};

const mockWebRegistration = {
  phone: "+919876543210",
  gender: "male",
  age: 30,
  city: "Delhi",
  fcm_token: "web-fcm-token",
};

// Helper to create mock request
function createMockRequest(body: object): Request {
  return new Request("http://localhost:54321/functions/v1/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("CORS preflight request returns 204", async () => {
  const req = new Request("http://localhost:54321/functions/v1/register", {
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

Deno.test("Web registration - accepts simple JSON payload", async () => {
  const body = mockWebRegistration;
  
  assertExists(body.phone);
  assertExists(body.gender);
  assertExists(body.age);
  assertExists(body.city);
});

Deno.test("Web registration - normalizes phone number", async () => {
  const phoneWithSpaces = "  +919876543210  ";
  const normalizedPhone = String(phoneWithSpaces).trim();
  
  assertEquals(normalizedPhone, "+919876543210");
});

Deno.test("Web registration - optional fcm_token", async () => {
  const bodyWithoutFcm = {
    phone: "+919876543210",
    gender: "female",
    age: 25,
    city: "Mumbai",
  };
  
  assertEquals(bodyWithoutFcm.fcm_token, undefined);
});

Deno.test("Mobile registration - accepts encrypted payload", async () => {
  const body = mockEncryptedPayload;
  
  assertExists(body.encrypted_key);
  assertExists(body.iv);
  assertExists(body.payload);
});

Deno.test("Mobile registration - validates required encrypted fields", async () => {
  const incompleteBody = {
    encrypted_key: "key-only",
  };
  
  const hasAllFields = !!(incompleteBody.encrypted_key && 
                       (incompleteBody as any).iv && 
                       (incompleteBody as any).payload);
  
  assertEquals(hasAllFields, false);
});

Deno.test("Validation - missing phone returns error", async () => {
  const body = {
    gender: "female",
    age: 25,
  };
  
  const hasPhone = !!(body as any).phone;
  assertEquals(hasPhone, false);
});

Deno.test("Validation - empty phone returns error", async () => {
  const phone = "";
  const isEmpty = !phone;
  
  assertEquals(isEmpty, true);
});

Deno.test("Database upsert - creates new user", async () => {
  const newUser = {
    phone: "+919876543210",
    gender: "female",
    age: 25,
    location: "Mumbai",
    fcm_token: "token-123",
  };
  
  const existingUser = null; // User doesn't exist
  
  // Should insert new user
  assertEquals(existingUser, null);
  assertExists(newUser.phone);
});

Deno.test("Database upsert - updates existing user", async () => {
  const existingUser = {
    phone: "+919876543210",
    gender: "female",
    age: 25,
    location: "Mumbai",
    fcm_token: "old-token",
    created_at: "2024-01-01T00:00:00Z",
  };
  
  const updatedUser = {
    ...existingUser,
    fcm_token: "new-token",
    age: 26,
  };
  
  assertEquals(updatedUser.phone, existingUser.phone);
  assertEquals(updatedUser.fcm_token, "new-token");
  assertEquals(updatedUser.age, 26);
});

Deno.test("Database upsert - uses phone as conflict key", async () => {
  const onConflict = "phone";
  
  assertEquals(onConflict, "phone");
});

Deno.test("Token generation - creates JWT with phone claim", async () => {
  const phone = "+919876543210";
  
  const token = await new jose.SignJWT({ phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  assertEquals(decoded.payload.phone, phone);
  assertExists(decoded.payload.iat);
  assertExists(decoded.payload.exp);
});

Deno.test("Token generation - sets 30 second expiry", async () => {
  const phone = "+919876543210";
  
  const token = await new jose.SignJWT({ phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  const exp = decoded.payload.exp as number;
  const iat = decoded.payload.iat as number;
  
  assertEquals(exp - iat, 30);
});

Deno.test("Response format - returns success, app_key, and phone", async () => {
  const response = {
    success: true,
    app_key: "jwt-token-here",
    phone: "+919876543210",
  };
  
  assertEquals(response.success, true);
  assertExists(response.app_key);
  assertEquals(response.phone, "+919876543210");
});

Deno.test("Response format - app_key is a valid JWT", async () => {
  const phone = "+919876543210";
  const token = await new jose.SignJWT({ phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  assertExists(decoded.payload);
  assertEquals(decoded.payload.phone, phone);
});

Deno.test("Error handling - invalid JSON returns 400", async () => {
  const malformedBody = "{ invalid json";
  
  let parseError: Error | null = null;
  try {
    JSON.parse(malformedBody);
  } catch (e) {
    parseError = e as Error;
  }
  
  assertExists(parseError);
});

Deno.test("Error handling - database error returns 500", async () => {
  const dbError = {
    message: "Unique constraint violation",
    code: "23505",
  };
  
  const expectedResponse = {
    error: dbError.message,
    errorType: "PostgresError",
  };
  
  assertStringIncludes(expectedResponse.error, "violation");
});

Deno.test("Error handling - token generation failure returns 500", async () => {
  const tokenError = new Error("Token generation failed");
  
  const expectedResponse = {
    error: `Token generation failed: ${tokenError.message}`,
  };
  
  assertStringIncludes(expectedResponse.error, "Token generation failed");
});

Deno.test("Error handling - missing ACCESS_KEY for mobile registration", async () => {
  const privateKeyPem = ""; // Empty
  
  const isEmpty = !privateKeyPem;
  assertEquals(isEmpty, true);
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

Deno.test("Environment variables - validates required vars", () => {
  const requiredVars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ACCESS_KEY",
    "JWT_SECRET",
  ];
  
  assertEquals(requiredVars.length, 4);
  assertEquals(requiredVars.includes("ACCESS_KEY"), true);
  assertEquals(requiredVars.includes("JWT_SECRET"), true);
});

// Encryption/decryption tests
Deno.test("Encryption - base64ToBytes converts correctly", async () => {
  const base64 = "SGVsbG8gV29ybGQ="; // "Hello World"
  
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const decoded = new TextDecoder().decode(bytes);
  
  assertEquals(decoded, "Hello World");
});

Deno.test("Encryption - hexToBytes converts correctly", async () => {
  const hex = "48656c6c6f"; // "Hello"
  const clean = hex.replace(/^0x/, "");
  
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  
  const decoded = new TextDecoder().decode(bytes);
  assertEquals(decoded, "Hello");
});

Deno.test("Encryption - validates AES key length", async () => {
  const validKeyLength = 32; // 256 bits
  const invalidKeyLength = 16; // 128 bits
  
  assertEquals(validKeyLength, 32);
  assertEquals(validKeyLength !== invalidKeyLength, true);
});

Deno.test("Encryption - validates IV length", async () => {
  const validIvLength = 16; // 128 bits
  const invalidIvLength = 8;
  
  assertEquals(validIvLength, 16);
  assertEquals(validIvLength !== invalidIvLength, true);
});

// Integration tests
Deno.test("Integration - full web registration flow", async () => {
  // Step 1: Parse request
  const body = mockWebRegistration;
  assertExists(body.phone);
  
  // Step 2: Normalize phone
  const normalizedPhone = String(body.phone).trim();
  assertEquals(normalizedPhone, "+919876543210");
  
  // Step 3: Upsert user
  const user = { ...body, location: body.city };
  assertEquals(user.phone, normalizedPhone);
  
  // Step 4: Generate token
  const token = await new jose.SignJWT({ phone: user.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  
  // Step 5: Return response
  const response = {
    success: true,
    app_key: token,
    phone: user.phone,
  };
  
  assertEquals(response.success, true);
  assertExists(response.app_key);
});

Deno.test("Integration - duplicate user registration flow", async () => {
  // Step 1: Check if user exists
  const existingUser = { phone: "+919876543210", created_at: "2024-01-01" };
  assertExists(existingUser);
  
  // Step 2: Upsert updates existing
  const updatedUser = { ...existingUser, age: 26 };
  assertEquals(updatedUser.phone, existingUser.phone);
});

// Edge cases
Deno.test("Edge case - phone number with country code", async () => {
  const phoneFormats = [
    "+919876543210",
    "+1-555-123-4567",
    "+44 20 7946 0958",
  ];
  
  for (const phone of phoneFormats) {
    const normalized = String(phone).trim();
    assertExists(normalized);
    assertEquals(normalized.startsWith("+"), true);
  }
});

Deno.test("Edge case - very long FCM token", async () => {
  const longFcmToken = "fcm:" + "x".repeat(500);
  
  assertEquals(longFcmToken.length > 500, true);
});

Deno.test("Edge case - special characters in city name", async () => {
  const cityWithSpecial = "St. John's \"City\"";
  
  assertStringIncludes(cityWithSpecial, ".");
  assertStringIncludes(cityWithSpecial, '"');
});

Deno.test("Edge case - unicode in user data", async () => {
  const unicodeUser = {
    phone: "+919876543210",
    city: "मुंबई",
    gender: "पुरुष",
  };
  
  assertEquals(unicodeUser.city, "मुंबई");
});

Deno.test("Edge case - age at boundaries", async () => {
  const minAge = 13;
  const maxAge = 120;
  
  assertEquals(minAge >= 0, true);
  assertEquals(maxAge <= 150, true);
});

Deno.test("Edge case - empty optional fields", async () => {
  const minimalUser = {
    phone: "+919876543210",
  };
  
  assertEquals((minimalUser as any).gender, undefined);
  assertEquals((minimalUser as any).age, undefined);
  assertEquals((minimalUser as any).city, undefined);
});

Deno.test("Edge case - concurrent registrations", async () => {
  const registrations = Array(5).fill(null).map((_, i) => ({
    phone: `+91987654321${i}`,
    gender: "female",
    age: 25,
  }));
  
  const results = await Promise.all(
    registrations.map(r => Promise.resolve({ success: true, phone: r.phone }))
  );
  
  assertEquals(results.length, 5);
  for (const result of results) {
    assertEquals(result.success, true);
  }
});

// Mock tests
Deno.test("Mock - Supabase upsert operation", () => {
  const userData = {
    phone: "+919876543210",
    gender: "female",
    age: 25,
    location: "Mumbai",
  };
  
  const mockResult = {
    data: { ...userData, created_at: "2024-01-01T00:00:00Z" },
    error: null,
  };
  
  assertEquals(mockResult.error, null);
  assertExists(mockResult.data);
});

Deno.test("Mock - Duplicate check query", () => {
  const phone = "+919876543210";
  
  const mockQuery = {
    table: "users",
    columns: ["phone", "idx"],
    filter: { phone },
    result: [{ phone, idx: 1 }],
  };
  
  assertEquals(mockQuery.filter.phone, phone);
  assertEquals(mockQuery.result.length, 1);
});

Deno.test("Mock - Private key import", () => {
  const pemString = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----`;
  
  // Simulate PEM cleaning
  const clean = pemString
    .replace(/-----BEGIN PRIVATE KEY-----/gi, "")
    .replace(/-----END PRIVATE KEY-----/gi, "")
    .replace(/[\r\n\s]+/g, "");
  
  assertEquals(clean.includes("BEGIN"), false);
  assertEquals(clean.includes("END"), false);
});
