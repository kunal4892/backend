import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { Logger } from "../utils/logger.ts";
import { rateLimiters } from "../utils/rateLimiter.ts";
import { validators, validatePhone } from "../utils/validator.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PRIVATE_KEY_PEM = Deno.env.get("ACCESS_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");

// Initialize logger for startup
const startupLogger = new Logger("startup", "startup");
startupLogger.info("=== BACKEND: STARTUP DEBUG ===", {
  access_key_exists: !!PRIVATE_KEY_PEM,
  access_key_length: PRIVATE_KEY_PEM ? PRIVATE_KEY_PEM.length : 0,
});

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function cors(): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  return headers;
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for(let i = 0; i < out.length; i++){
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

async function importPrivateKeyPem(pemString: string): Promise<CryptoKey> {
  if (!pemString) throw new Error("PRIVATE_KEY secret empty");
  
  // Precise stripping (case-insensitive, handles \r\n or \n)
  let clean = pemString
    .replace(/-----BEGIN PRIVATE KEY-----/gi, "")
    .replace(/-----END PRIVATE KEY-----/gi, "")
    .replace(/[\r\n\s]+/g, "");
  
  // Validate base64 early
  try {
    atob(clean);
  } catch (e) {
    throw new Error(`Invalid base64 in PEM: ${(e as Error).message}. Check env var pasting.`);
  }
  
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  
  // Validate DER structure
  if (der.length < 10 || der[0] !== 0x30) {
    throw new Error(`Invalid DER: Expected SEQUENCE (0x30) at start, got 0x${der[0]?.toString(16)?.toUpperCase() || 'undefined'}. DER too short or corrupted.`);
  }
  
  try {
    return await crypto.subtle.importKey("pkcs8", der.buffer, {
      name: "RSA-OAEP",
      hash: "SHA-256"
    }, false, ["decrypt"]);
  } catch (importErr) {
    startupLogger.error("Import key error", importErr as Error);
    throw importErr;
  }
}

serve(async (req) => {
  // Create request-scoped logger with trace IDs
  const logger = Logger.fromRequest(req);
  
  logger.info("=== BACKEND: REGISTER REQUEST START ===", {
    method: req.method,
    url: req.url,
  });
  
  if (req.method === "OPTIONS") {
    const headers = cors();
    logger.addTraceHeaders(headers);
    return new Response(null, { status: 204, headers });
  }
  
  // --- 1️⃣ Rate Limiting Check ---
  const rateLimitCheck = rateLimiters.registration(req, logger);
  
  if (!rateLimitCheck.allowed) {
    logger.warn("Registration rate limit exceeded", {
      limit: rateLimitCheck.result.limit,
      retry_after: rateLimitCheck.result.retryAfter,
    });
    
    const headers = cors();
    if (rateLimitCheck.headers) {
      Object.entries(rateLimitCheck.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    logger.addTraceHeaders(headers);
    
    return json({
      error: "Too many registration attempts. Please try again later.",
    }, 429, headers);
  }
  
  // Parse request body
  let body;
  try {
    const bodyText = await req.text();
    logger.debug("Raw request body received", { length: bodyText.length });
    body = JSON.parse(bodyText);
  } catch (parseError) {
    logger.error("Failed to parse request body", parseError as Error);
    const headers = cors();
    logger.addTraceHeaders(headers);
    return json({
      error: "Invalid request body. Expected JSON format."
    }, 400, headers);
  }
  
  try {
    logger.info("=== BACKEND: REGISTER REQUEST RECEIVED ===", {
      has_encrypted_key: !!body.encrypted_key,
      has_iv: !!body.iv,
      has_payload: !!body.payload,
      has_phone: !!body.phone,
    });
    
    // Support both encrypted (mobile) and simple (web) registration
    let phone: string;
    let fcm_token: string | undefined;
    let gender: string | undefined;
    let age: number | undefined;
    let city: string | undefined;
    
    if (body.phone) {
      // Simple web registration - no encryption needed
      logger.info("Simple web registration detected");
      
      // Validate phone number
      const phoneValidation = validatePhone(body.phone);
      if (!phoneValidation.valid) {
        logger.warn("Invalid phone number format", { phone: body.phone });
        const headers = cors();
        logger.addTraceHeaders(headers);
        return json({ error: "Invalid phone number format" }, 400, headers);
      }
      
      phone = phoneValidation.normalized!;
      fcm_token = body.fcm_token;
      gender = body.gender;
      age = body.age;
      city = body.city || body.location;
      
    } else {
      // Encrypted mobile registration
      const { encrypted_key, iv, payload } = body;
      
      if (!encrypted_key || !iv || !payload) {
        logger.warn("Missing encrypted registration fields");
        const headers = cors();
        logger.addTraceHeaders(headers);
        return json({ error: "Missing encrypted_key, iv, or payload" }, 400, headers);
      }
      
      // Import private key
      logger.info("Importing private key for decryption");
      const privateKey = await importPrivateKeyPem(PRIVATE_KEY_PEM!);
      
      // Decrypt RSA
      const encryptedKeyBytes = base64ToBytes(encrypted_key);
      let aesKeyBuf: ArrayBuffer;
      
      try {
        aesKeyBuf = await crypto.subtle.decrypt(
          { name: "RSA-OAEP" },
          privateKey,
          encryptedKeyBytes
        );
      } catch (rsaError) {
        logger.error("RSA-OAEP decryption failed", rsaError as Error);
        throw new Error(`RSA-OAEP decryption failed: ${(rsaError as Error).message}`);
      }
      
      // Process AES key
      const aesKeyBytes = new Uint8Array(aesKeyBuf);
      if (aesKeyBytes.length !== 32) {
        throw new Error(`AES key should be 32 bytes, got ${aesKeyBytes.length}`);
      }
      
      // Convert IV from hex to bytes
      const ivBytes = hexToBytes(iv);
      if (ivBytes.length !== 16) {
        throw new Error(`IV should be 16 bytes, got ${ivBytes.length}`);
      }
      
      // Decode cipher payload
      const cipherBytes = base64ToBytes(payload);
      
      // Import AES key
      const key = await crypto.subtle.importKey("raw", aesKeyBytes, {
        name: "AES-CBC"
      }, false, ["decrypt"]);
      
      // Decrypt AES-CBC
      let plainBuf: ArrayBuffer;
      try {
        plainBuf = await crypto.subtle.decrypt({
          name: "AES-CBC",
          iv: ivBytes
        }, key, cipherBytes);
      } catch (aesError) {
        logger.error("AES-CBC decryption failed", aesError as Error);
        throw aesError;
      }
      
      const plaintext = new TextDecoder().decode(plainBuf);
      
      let obj;
      try {
        obj = JSON.parse(plaintext);
      } catch (parseErr) {
        logger.error("Failed to parse decrypted data", parseErr as Error);
        throw new Error(`Failed to parse decrypted data: ${(parseErr as Error).message}`);
      }
      
      // Validate phone number
      const phoneValidation = validatePhone(obj.phone);
      if (!phoneValidation.valid) {
        logger.warn("Invalid phone number in encrypted data");
        const headers = cors();
        logger.addTraceHeaders(headers);
        return json({ error: "Invalid phone number format" }, 400, headers);
      }
      
      phone = phoneValidation.normalized!;
      fcm_token = obj.fcm_token;
      gender = obj.gender;
      age = obj.age;
      city = obj.city;
    }
    
    logger.info("=== BACKEND: FINAL REGISTRATION DATA ===", {
      phone: phone.slice(-4),
      has_gender: !!gender,
      has_age: !!age,
      has_city: !!city,
      has_fcm_token: !!fcm_token,
    });
    
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("phone, idx, created_at")
      .eq("phone", phone)
      .maybeSingle();
    
    if (existingUser) {
      logger.info("User already exists, updating", {
        phone: existingUser.phone,
        idx: existingUser.idx,
      });
    }
    
    // Upsert user
    const { data: user, error } = await supabase.from("users").upsert({
      phone,
      gender,
      age,
      location: city,
      fcm_token
    }, {
      onConflict: "phone"
    }).select("*").single();
    
    if (error) {
      logger.error("User upsert failed", error);
      throw error;
    }
    
    if (!user || !user.phone) {
      logger.error("Upsert returned no user data");
      throw new Error("Failed to create/update user");
    }
    
    // Generate JWT token
    logger.info("Generating JWT token");
    const app_key = await new jose.SignJWT({
      phone: user.phone
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(new TextEncoder().encode(JWT_SECRET));
    
    logger.info("=== BACKEND: Registration complete ===", {
      phone: user.phone.slice(-4),
      token_length: app_key.length,
    });
    
    const responseBody = {
      success: true,
      app_key,
      phone: user.phone
    };
    
    const headers = cors();
    logger.addTraceHeaders(headers);
    
    // Add rate limit headers
    if (rateLimitCheck.headers) {
      Object.entries(rateLimitCheck.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }
    
    return json(responseBody, 200, headers);
    
  } catch (e: any) {
    logger.error("Registration error", e);
    
    const errorResponse = {
      error: e.message || "Registration failed",
      errorType: e.name || "UnknownError"
    };
    
    const headers = cors();
    logger.addTraceHeaders(headers);
    
    return json(errorResponse, 500, headers);
  }
});

function json(obj: unknown, status = 200, headers?: Headers): Response {
  const responseHeaders = headers || cors();
  return new Response(JSON.stringify(obj), {
    status,
    headers: responseHeaders
  });
}
