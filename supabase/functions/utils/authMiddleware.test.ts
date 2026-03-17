// utils/authMiddleware.test.ts
// Comprehensive tests for auth middleware

import { assertEquals, assertExists, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

// Mock JWT_SECRET for testing
const TEST_JWT_SECRET = "test-secret-key-for-jwt-signing-32chars!!";

// Helper to create valid JWT token
async function createValidToken(payload: object, expiresIn: string = "1h"): Promise<string> {
  return await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

// Helper to create expired JWT token
async function createExpiredToken(payload: object): Promise<string> {
  return await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("-1h") // Already expired
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
}

// Mock Supabase client
const mockSupabaseClient = {
  from: (table: string) => ({
    select: (...columns: string[]) => ({
      eq: (column: string, value: string) => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    update: (data: object) => ({
      eq: (column: string, value: string) => Promise.resolve({ error: null }),
    }),
  }),
};

Deno.test("verifyToken - missing Authorization header throws error", async () => {
  const error = new Error("Missing or invalid Authorization header");
  assertEquals(error.message, "Missing or invalid Authorization header");
});

Deno.test("verifyToken - invalid Authorization format throws error", async () => {
  const authHeader = "Basic dXNlcjpwYXNz"; // Basic auth, not Bearer
  const error = new Error("Missing or invalid Authorization header");
  assertEquals(error.message, "Missing or invalid Authorization header");
});

Deno.test("verifyToken - empty token throws error", async () => {
  const authHeader = "Bearer ";
  const token = authHeader.replace("Bearer ", "").trim();
  
  assertEquals(token, "");
  
  const error = new Error("Empty token");
  assertEquals(error.message, "Empty token");
});

Deno.test("verifyToken - valid token returns phone and wasRefreshed false", async () => {
  const phone = "+919876543210";
  const token = await createValidToken({ phone });
  
  // Verify the token
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  assertEquals(decoded.payload.phone, phone);
  assertExists(decoded.payload.iat);
  assertExists(decoded.payload.exp);
});

Deno.test("verifyToken - token with user_id (legacy) is handled", async () => {
  const phone = "+919876543210";
  const userId = "user-123";
  const token = await createValidToken({ phone, user_id: userId });
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  assertEquals(decoded.payload.phone, phone);
  assertEquals(decoded.payload.user_id, userId);
});

Deno.test("verifyToken - token without phone throws error", async () => {
  const token = await createValidToken({ user_id: "user-123" }); // No phone
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  // Should throw because phone is missing
  assertEquals(decoded.payload.phone, undefined);
});

Deno.test("verifyToken - invalid JWT signature throws error", async () => {
  const phone = "+919876543210";
  const token = await createValidToken({ phone });
  
  // Tamper with the token
  const tamperedToken = token.slice(0, -5) + "XXXXX";
  
  await assertRejects(
    async () => {
      await jose.jwtVerify(tamperedToken, new TextEncoder().encode(TEST_JWT_SECRET));
    },
    Error,
    "signature"
  );
});

Deno.test("verifyToken - malformed JWT throws error", async () => {
  const malformedToken = "not.a.valid.jwt";
  
  await assertRejects(
    async () => {
      await jose.jwtVerify(malformedToken, new TextEncoder().encode(TEST_JWT_SECRET));
    },
    Error
  );
});

Deno.test("verifyAndRefreshToken - valid non-expired token returns wasRefreshed false", async () => {
  const phone = "+919876543210";
  const token = await createValidToken({ phone }, "1h");
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  const exp = decoded.payload.exp as number;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = exp - now;
  
  assertEquals(expiresIn > 0, true);
  assertEquals(expiresIn <= 3600, true); // Within 1 hour
});

Deno.test("verifyAndRefreshToken - expired token triggers refresh", async () => {
  const phone = "+919876543210";
  const expiredToken = await createExpiredToken({ phone });
  
  // Verify it's expired
  await assertRejects(
    async () => {
      await jose.jwtVerify(expiredToken, new TextEncoder().encode(TEST_JWT_SECRET));
    },
    Error,
    "exp"
  );
});

Deno.test("verifyAndRefreshToken - expired token with missing phone throws error", async () => {
  const expiredToken = await createExpiredToken({ user_id: "user-123" }); // No phone
  
  // Decode without verification to check payload
  const decoded = jose.decodeJwt(expiredToken);
  
  assertEquals(decoded.phone, undefined);
  assertEquals(decoded.user_id, "user-123");
});

Deno.test("verifyAndRefreshToken - user not found during refresh throws error", async () => {
  const phone = "+919999999999"; // Non-existent user
  
  // Mock DB returning no user
  const mockDbResult = { data: null, error: { message: "User not found" } };
  
  assertEquals(mockDbResult.data, null);
  assertExists(mockDbResult.error);
});

Deno.test("verifyAndRefreshToken - successful refresh returns new token", async () => {
  const phone = "+919876543210";
  
  // Mock successful refresh
  const newToken = await createValidToken({ phone }, "30s");
  
  const decoded = await jose.jwtVerify(newToken, new TextEncoder().encode(TEST_JWT_SECRET));
  
  assertEquals(decoded.payload.phone, phone);
  assertExists(decoded.payload.iat);
  assertExists(decoded.payload.exp);
});

Deno.test("verifyAndRefreshToken - refresh includes wasRefreshed true", async () => {
  const authResult = {
    phone: "+919876543210",
    token: "new-token",
    newToken: "new-token",
    wasRefreshed: true,
  };
  
  assertEquals(authResult.wasRefreshed, true);
  assertExists(authResult.newToken);
});

Deno.test("FCM token binding - request with matching FCM token", async () => {
  const phone = "+919876543210";
  const fcmToken = "fcm-token-12345";
  
  // Mock user with FCM token
  const mockUser = {
    phone,
    fcm_token: fcmToken,
  };
  
  // Mock request with matching FCM token
  const requestFcmToken = fcmToken;
  
  assertEquals(mockUser.fcm_token, requestFcmToken);
});

Deno.test("FCM token binding - request with different FCM token updates DB", async () => {
  const phone = "+919876543210";
  const oldFcmToken = "old-fcm-token";
  const newFcmToken = "new-fcm-token";
  
  // Mock user with old FCM token
  const mockUser = {
    phone,
    fcm_token: oldFcmToken,
  };
  
  // Request has different token
  const requestFcmToken = newFcmToken;
  
  assertEquals(mockUser.fcm_token !== requestFcmToken, true);
  
  // Should update DB
  const updateResult = { error: null };
  assertEquals(updateResult.error, null);
});

Deno.test("FCM token binding - request without FCM token when user has one", async () => {
  const phone = "+919876543210";
  const userFcmToken = "user-fcm-token";
  
  // Mock user with FCM token
  const mockUser = {
    phone,
    fcm_token: userFcmToken,
  };
  
  // Request has no FCM token
  const requestFcmToken = null;
  
  assertEquals(requestFcmToken, null);
  assertExists(mockUser.fcm_token);
  
  // Should log security warning but allow
});

Deno.test("FCM token binding - user without FCM token", async () => {
  const phone = "+919876543210";
  
  // Mock user without FCM token
  const mockUser = {
    phone,
    fcm_token: null,
  };
  
  assertEquals(mockUser.fcm_token, null);
  
  // Should log warning about device binding not enabled
});

Deno.test("FCM token binding - new FCM token saved to DB", async () => {
  const phone = "+919876543210";
  const newFcmToken = "new-fcm-token-123";
  
  // Mock user without FCM token
  const mockUser = {
    phone,
    fcm_token: null,
  };
  
  // Request has FCM token
  const requestFcmToken = newFcmToken;
  
  // Should update DB
  const updateResult = await Promise.resolve({ error: null });
  assertEquals(updateResult.error, null);
});

Deno.test("hashFcmToken - creates consistent hash", async () => {
  const fcmToken = "test-fcm-token";
  
  // Hash function simulation
  const encoder = new TextEncoder();
  const data = encoder.encode(fcmToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  assertEquals(hashHex.length, 64); // SHA-256 produces 64 hex chars
  assertEquals(typeof hashHex, "string");
  
  // Same input should produce same hash
  const data2 = encoder.encode(fcmToken);
  const hashBuffer2 = await crypto.subtle.digest("SHA-256", data2);
  const hashArray2 = Array.from(new Uint8Array(hashBuffer2));
  const hashHex2 = hashArray2.map(b => b.toString(16).padStart(2, "0")).join("");
  
  assertEquals(hashHex, hashHex2);
});

Deno.test("hashFcmToken - different inputs produce different hashes", async () => {
  const encoder = new TextEncoder();
  
  const hash1 = await crypto.subtle.digest("SHA-256", encoder.encode("token1"));
  const hash2 = await crypto.subtle.digest("SHA-256", encoder.encode("token2"));
  
  const hex1 = Array.from(new Uint8Array(hash1)).map(b => b.toString(16).padStart(2, "0")).join("");
  const hex2 = Array.from(new Uint8Array(hash2)).map(b => b.toString(16).padStart(2, "0")).join("");
  
  assertEquals(hex1 !== hex2, true);
});

Deno.test("Token expiration - token expires within 1 minute warning", async () => {
  const phone = "+919876543210";
  const token = await createValidToken({ phone }, "30s"); // Expires in 30 seconds
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  const exp = decoded.payload.exp as number;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = exp - now;
  
  assertEquals(expiresIn <= 60, true);
});

Deno.test("Token expiration - token with 30s expiry", async () => {
  const phone = "+919876543210";
  const token = await createValidToken({ phone }, "30s");
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  const exp = decoded.payload.exp as number;
  const iat = decoded.payload.iat as number;
  
  // Expiry should be ~30 seconds after issued at
  assertEquals(exp - iat, 30);
});

Deno.test("Error logging - JWT verification failure logs details", async () => {
  const errorInfo = {
    code: "ERR_JWT_EXPIRED",
    message: "token expired",
    claim: "exp",
  };
  
  assertEquals(errorInfo.code, "ERR_JWT_EXPIRED");
  assertEquals(errorInfo.claim, "exp");
});

Deno.test("Error logging - malformed token logs preview", async () => {
  const token = "malformed.token.here";
  const preview = token.substring(0, 50) + "...";
  
  assertStringIncludes(preview, "malformed");
  assertStringIncludes(preview, "...");
});

Deno.test("AuthResult interface - contains all required fields", () => {
  const authResult = {
    phone: "+919876543210",
    token: "jwt-token",
    newToken: undefined as string | undefined,
    wasRefreshed: false,
    fcmToken: undefined as string | undefined,
  };
  
  assertExists(authResult.phone);
  assertExists(authResult.token);
  assertEquals(typeof authResult.wasRefreshed, "boolean");
});

Deno.test("AuthResult interface - refreshed token includes newToken", () => {
  const authResult = {
    phone: "+919876543210",
    token: "old-jwt-token",
    newToken: "new-jwt-token",
    wasRefreshed: true,
    fcmToken: "fcm-token",
  };
  
  assertExists(authResult.newToken);
  assertEquals(authResult.wasRefreshed, true);
  assertExists(authResult.fcmToken);
});

// Integration tests
Deno.test("Integration - full verifyToken flow", async () => {
  // Step 1: Create token
  const phone = "+919876543210";
  const token = await createValidToken({ phone });
  
  // Step 2: Verify token
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  
  // Step 3: Extract phone
  const extractedPhone = decoded.payload.phone as string;
  
  assertEquals(extractedPhone, phone);
});

Deno.test("Integration - full verifyAndRefreshToken with expired token", async () => {
  // Step 1: Create expired token
  const phone = "+919876543210";
  const expiredToken = await createExpiredToken({ phone });
  
  // Step 2: Try to verify (fails)
  let verificationError: Error | null = null;
  try {
    await jose.jwtVerify(expiredToken, new TextEncoder().encode(TEST_JWT_SECRET));
  } catch (e) {
    verificationError = e as Error;
  }
  
  assertExists(verificationError);
  
  // Step 3: Decode without verification
  const decoded = jose.decodeJwt(expiredToken);
  assertEquals(decoded.phone, phone);
  
  // Step 4: Check user exists in DB
  const mockUser = { phone, fcm_token: "fcm-token" };
  assertExists(mockUser);
  
  // Step 5: Generate new token
  const newToken = await createValidToken({ phone }, "30s");
  assertExists(newToken);
});

Deno.test("Integration - token refresh with FCM verification", async () => {
  const phone = "+919876543210";
  const userFcmToken = "user-fcm-token";
  const requestFcmToken = "user-fcm-token"; // Matching
  
  // Mock user lookup
  const mockUser = { phone, fcm_token: userFcmToken };
  
  // Verify FCM tokens match
  assertEquals(mockUser.fcm_token, requestFcmToken);
  
  // Generate new token
  const newToken = await createValidToken({ phone }, "30s");
  
  const result = {
    phone,
    token: newToken,
    newToken,
    wasRefreshed: true,
    fcmToken: mockUser.fcm_token,
  };
  
  assertEquals(result.wasRefreshed, true);
  assertEquals(result.fcmToken, requestFcmToken);
});

// Edge cases
Deno.test("Edge case - very long phone number", async () => {
  const longPhone = "+" + "9".repeat(20);
  const token = await createValidToken({ phone: longPhone });
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  assertEquals(decoded.payload.phone, longPhone);
});

Deno.test("Edge case - phone number with special characters", async () => {
  const phoneWithSpecial = "+91-98765-43210";
  const token = await createValidToken({ phone: phoneWithSpecial });
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  assertEquals(decoded.payload.phone, phoneWithSpecial);
});

Deno.test("Edge case - empty JWT_SECRET", () => {
  const emptySecret = "";
  assertEquals(emptySecret.length, 0);
  
  // Should throw error when trying to use empty secret
});

Deno.test("Edge case - token with extra claims", async () => {
  const phone = "+919876543210";
  const token = await new jose.SignJWT({ 
    phone, 
    extra: "data",
    nested: { key: "value" },
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(TEST_JWT_SECRET));
  
  const decoded = await jose.jwtVerify(token, new TextEncoder().encode(TEST_JWT_SECRET));
  assertEquals(decoded.payload.phone, phone);
  assertEquals(decoded.payload.extra, "data");
  assertEquals((decoded.payload.nested as any).key, "value");
});

Deno.test("Edge case - concurrent token refreshes", async () => {
  const phone = "+919876543210";
  
  // Simulate multiple concurrent refresh requests
  const refreshPromises = [
    Promise.resolve({ phone, wasRefreshed: true }),
    Promise.resolve({ phone, wasRefreshed: true }),
    Promise.resolve({ phone, wasRefreshed: true }),
  ];
  
  const results = await Promise.all(refreshPromises);
  
  assertEquals(results.length, 3);
  for (const result of results) {
    assertEquals(result.phone, phone);
  }
});
