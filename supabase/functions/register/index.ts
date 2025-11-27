import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PRIVATE_KEY_PEM = Deno.env.get("ACCESS_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
console.log("=== BACKEND: STARTUP DEBUG ===");
console.log("DEBUG: ACCESS_KEY exists?", !!PRIVATE_KEY_PEM);
console.log("DEBUG: ACCESS_KEY length:", PRIVATE_KEY_PEM ? PRIVATE_KEY_PEM.length : 0);
console.log("DEBUG: ACCESS_KEY preview (first 100):", PRIVATE_KEY_PEM ? PRIVATE_KEY_PEM.substring(0, 100) : "UNDEFINED!");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
function base64ToBytes(b64) {
  console.log("DEBUG: base64ToBytes input length:", b64.length);
  console.log("DEBUG: base64ToBytes first 50 chars:", b64.substring(0, 50));
  return Uint8Array.from(atob(b64), (c)=>c.charCodeAt(0));
}
function hexToBytes(hex) {
  const clean = hex.replace(/^0x/, "");
  console.log("DEBUG: hexToBytes clean length:", clean.length);
  const out = new Uint8Array(clean.length / 2);
  for(let i = 0; i < out.length; i++){
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
async function importPrivateKeyPem(pemString) {
  console.log("\n=== BACKEND: PRIVATE KEY IMPORT DEBUG ===");
  console.log("DEBUG: pemString type:", typeof pemString);
  console.log("DEBUG: pemString length:", pemString.length);
  console.log("DEBUG: Raw PEM preview (first 100):", pemString.substring(0, 100));
  if (!pemString) throw new Error("PRIVATE_KEY secret empty");
  // Precise stripping (case-insensitive, handles \r\n or \n)
  let clean = pemString.replace(/-----BEGIN PRIVATE KEY-----/gi, "").replace(/-----END PRIVATE KEY-----/gi, "").replace(/[\r\n\s]+/g, ""); // Remove all whitespace/newlines
  console.log("DEBUG: Clean base64 length:", clean.length);
  console.log("DEBUG: Clean base64 preview (first 50):", clean.substring(0, 50));
  console.log("DEBUG: Clean ends with padding?", clean.endsWith('=') || clean.endsWith('=='));
  // Validate base64 early
  try {
    atob(clean);
  } catch (e) {
    throw new Error(`Invalid base64 in PEM: ${e.message}. Check env var pasting.`);
  }
  const der = Uint8Array.from(atob(clean), (c)=>c.charCodeAt(0));
  console.log("DEBUG: DER bytes length:", der.length);
  console.log("DEBUG: DER first 10 bytes (hex):", Array.from(der.slice(0, 10)).map((b)=>b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
  // Validate DER structure
  if (der.length < 10 || der[0] !== 0x30) {
    throw new Error(`Invalid DER: Expected SEQUENCE (0x30) at start, got 0x${der[0]?.toString(16)?.toUpperCase() || 'undefined'}. DER too short or corrupted.`);
  }
  try {
    return await crypto.subtle.importKey("pkcs8", der.buffer, {
      name: "RSA-OAEP",
      hash: "SHA-256"
    }, false, [
      "decrypt"
    ]);
  } catch (importErr) {
    console.error("DEBUG: Import key error details:", importErr.message);
    throw importErr;
  }
}
serve(async (req)=>{
  console.log("\n=== BACKEND: REGISTER REQUEST START ===");
  console.log("DEBUG: Request method:", req.method);
  console.log("DEBUG: Request URL:", req.url);
  console.log("DEBUG: Request headers:", Object.fromEntries(req.headers.entries()));
  
  if (req.method === "OPTIONS") {
    console.log("DEBUG: Handling OPTIONS preflight");
    return new Response(null, {
      status: 204,
      headers: cors()
    });
  }
  
  // Ensure we always return JSON, even for parsing errors
  let body;
  try {
    const bodyText = await req.text();
    console.log("DEBUG: Raw request body length:", bodyText.length);
    console.log("DEBUG: Raw request body preview (first 200 chars):", bodyText.substring(0, 200));
    body = JSON.parse(bodyText);
    console.log("✅ BACKEND: Successfully parsed JSON body");
  } catch (parseError: any) {
    console.error("❌ BACKEND: Failed to parse request body as JSON:", parseError.message);
    return new Response(JSON.stringify({
      error: "Invalid request body. Expected JSON format."
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  }
  
  try {
    console.log("\n=== BACKEND: REGISTER REQUEST RECEIVED ===");
    console.log("DEBUG: Received body keys:", Object.keys(body));
    console.log("DEBUG: Full body structure:", JSON.stringify({
      hasEncryptedKey: !!body.encrypted_key,
      hasIv: !!body.iv,
      hasPayload: !!body.payload,
      hasPhone: !!body.phone,
      encryptedKeyLength: body.encrypted_key?.length || 0,
      ivLength: body.iv?.length || 0,
      payloadLength: body.payload?.length || 0
    }));
    
    // Support both encrypted (mobile) and simple (web) registration
    let phone: string;
    let fcm_token: string | undefined;
    let gender: string | undefined;
    let age: number | undefined;
    let city: string | undefined;
    
    if (body.phone) {
      // Simple web registration - no encryption needed
      console.log("DEBUG: Simple web registration detected");
      console.log("DEBUG: Web registration data:", {
        phone: body.phone,
        hasGender: !!body.gender,
        hasAge: !!body.age,
        hasCity: !!(body.city || body.location),
        hasFcmToken: !!body.fcm_token
      });
      phone = body.phone;
      fcm_token = body.fcm_token;
      gender = body.gender;
      age = body.age;
      city = body.city || body.location;
    } else {
      // Encrypted mobile registration
      const { encrypted_key, iv, payload } = body;
      console.log("DEBUG: Encrypted mobile registration detected");
      console.log("DEBUG: Encrypted data validation:", {
        hasEncryptedKey: !!encrypted_key,
        hasIv: !!iv,
        hasPayload: !!payload,
        encryptedKeyType: typeof encrypted_key,
        ivType: typeof iv,
        payloadType: typeof payload
      });
      console.log("DEBUG: Received encrypted_key length:", encrypted_key?.length);
      console.log("DEBUG: Received encrypted_key (first 50 base64):", encrypted_key?.substring(0, 50));
      console.log("DEBUG: Received iv length:", iv?.length);
      console.log("DEBUG: Received iv (full hex):", iv);
      console.log("DEBUG: Received payload length:", payload?.length);
      console.log("DEBUG: Received payload (first 50 base64):", payload?.substring(0, 50));
      if (!encrypted_key || !iv || !payload) {
        throw new Error("Missing encrypted_key, iv, or payload");
      }
      // Import private key
      console.log("\n=== BACKEND: IMPORTING PRIVATE KEY ===");
      const privateKey = await importPrivateKeyPem(PRIVATE_KEY_PEM);
      console.log("✅ BACKEND: Private key imported successfully");
      // Decrypt RSA
      console.log("\n=== BACKEND: RSA DECRYPTION ===");
      const encryptedKeyBytes = base64ToBytes(encrypted_key);
      console.log("DEBUG: Encrypted key bytes length:", encryptedKeyBytes.length);
      console.log("DEBUG: Encrypted key bytes (first 20 hex):", Array.from(encryptedKeyBytes.slice(0, 20)).map((b)=>b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
      let aesKeyBuf;
      try {
        aesKeyBuf = await crypto.subtle.decrypt({
        name: "RSA-OAEP"
      }, privateKey, encryptedKeyBytes);
      console.log("✅ BACKEND: RSA-OAEP decryption successful! Output length:", aesKeyBuf.byteLength);
    } catch (rsaError) {
      console.error("❌ BACKEND: RSA-OAEP decryption failed");
      console.error("DEBUG: RSA Error:", rsaError.message);
      console.error("DEBUG: Encrypted key bytes length:", encryptedKeyBytes.length);
      console.error("DEBUG: Encrypted key (first 50 base64):", encrypted_key.substring(0, 50));
      throw new Error(`RSA-OAEP decryption failed: ${rsaError.message}`);
    }
    // Process AES key
    const aesKeyBytes = new Uint8Array(aesKeyBuf);
    console.log("\n=== BACKEND: AES KEY EXTRACTED ===");
    console.log("DEBUG: AES key bytes length:", aesKeyBytes.length);
    console.log("DEBUG: AES key (full hex):", Array.from(aesKeyBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    if (aesKeyBytes.length !== 32) {
      throw new Error(`AES key should be 32 bytes, got ${aesKeyBytes.length}`);
    }
    // Convert IV from hex to bytes
    console.log("\n=== BACKEND: IV PROCESSING ===");
    console.log("DEBUG: IV hex string (full):", iv);
    const ivBytes = hexToBytes(iv);
    console.log("DEBUG: IV bytes length:", ivBytes.length);
    console.log("DEBUG: IV bytes (full hex):", Array.from(ivBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    if (ivBytes.length !== 16) {
      throw new Error(`IV should be 16 bytes, got ${ivBytes.length}`);
    }
    // Decode cipher payload
    console.log("\n=== BACKEND: AES DECRYPTION SETUP ===");
    const cipherBytes = base64ToBytes(payload);
    console.log("DEBUG: Cipher bytes length:", cipherBytes.length);
    console.log("DEBUG: Cipher bytes mod 16:", cipherBytes.length % 16);
    console.log("DEBUG: Cipher (first 50 bytes hex):", Array.from(cipherBytes.slice(0, 50)).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    console.log("DEBUG: Cipher (last 16 bytes hex):", Array.from(cipherBytes.slice(-16)).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    // Import AES key
    const key = await crypto.subtle.importKey("raw", aesKeyBytes, {
      name: "AES-CBC"
    }, false, [
      "decrypt"
    ]);
    // Decrypt AES-CBC
    console.log("\n=== BACKEND: AES DECRYPTION ATTEMPT ===");
    console.log("DEBUG: Using AES key (hex):", Array.from(aesKeyBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    console.log("DEBUG: Using IV (hex):", Array.from(ivBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
    console.log("DEBUG: Cipher length:", cipherBytes.length);
    let plainBuf;
    try {
      plainBuf = await crypto.subtle.decrypt({
        name: "AES-CBC",
        iv: ivBytes
      }, key, cipherBytes);
      console.log("✅ BACKEND: AES-CBC decryption successful! Plain length:", plainBuf.byteLength);
    } catch (aesError) {
      console.error("❌ BACKEND: AES-CBC decryption failed:", aesError.message);
      console.error("DEBUG: Cipher bytes length:", cipherBytes.length, "(should be multiple of 16)");
      console.error("DEBUG: Cipher length mod 16:", cipherBytes.length % 16);
      console.error("DEBUG: First 16 bytes of cipher (hex):", Array.from(cipherBytes.slice(0, 16)).map((b)=>b.toString(16).padStart(2, '0')).join(''));
      console.error("DEBUG: Last 16 bytes of cipher (hex):", Array.from(cipherBytes.slice(-16)).map((b)=>b.toString(16).padStart(2, '0')).join(''));
      console.error("DEBUG: AES key (hex):", Array.from(aesKeyBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
      console.error("DEBUG: IV (hex):", Array.from(ivBytes).map((b)=>b.toString(16).padStart(2, '0')).join(''));
      throw aesError;
    }
      const plaintext = new TextDecoder().decode(plainBuf);
      console.log("\n=== BACKEND: DECRYPTED PLAINTEXT ===");
      console.log("DEBUG: Decrypted plaintext length:", plaintext.length);
      console.log("DEBUG: Decrypted plaintext (full):", plaintext);
      
      let obj;
      try {
        obj = JSON.parse(plaintext);
        console.log("✅ BACKEND: Successfully parsed decrypted JSON");
        console.log("DEBUG: Parsed JSON keys:", Object.keys(obj));
        console.log("DEBUG: Parsed JSON values:", {
          hasPhone: !!obj.phone,
          phone: obj.phone,
          hasFcmToken: !!obj.fcm_token,
          hasGender: !!obj.gender,
          hasAge: !!obj.age,
          hasCity: !!obj.city
        });
      } catch (parseErr: any) {
        console.error("❌ BACKEND: Failed to parse decrypted plaintext as JSON:", parseErr.message);
        console.error("DEBUG: Plaintext that failed to parse:", plaintext);
        throw new Error(`Failed to parse decrypted data: ${parseErr.message}`);
      }
      
      phone = obj.phone;
      fcm_token = obj.fcm_token;
      gender = obj.gender;
      age = obj.age;
      city = obj.city;
    }
    
    console.log("\n=== BACKEND: FINAL REGISTRATION DATA ===");
    console.log("DEBUG: Final phone:", phone);
    console.log("DEBUG: Final data:", {
      phone: phone,
      hasGender: !!gender,
      gender: gender,
      hasAge: !!age,
      age: age,
      hasCity: !!city,
      city: city,
      hasFcmToken: !!fcm_token,
      fcmTokenPreview: fcm_token ? `${fcm_token.substring(0, 20)}...` : "null"
    });
    
    if (!phone) {
      console.error("❌ BACKEND: Phone number is missing after processing");
      throw new Error("Phone number is required");
    }
    // Normalize phone number: ensure it's a string, trim whitespace
    const normalizedPhone = String(phone).trim();
    console.log("\n=== BACKEND: USER REGISTRATION ===");
    console.log("DEBUG: Registering user:", {
      phone: normalizedPhone,
      phoneType: typeof normalizedPhone,
      phoneLength: normalizedPhone.length,
      gender,
      age,
      city,
      fcm_token: fcm_token ? `${fcm_token.substring(0, 20)}...` : "null" // Truncate for logs
    });
    
    // Check if user already exists before upsert
    const { data: existingUser } = await supabase
      .from("users")
      .select("phone, idx, created_at")
      .eq("phone", normalizedPhone)
      .maybeSingle();
    
    if (existingUser) {
      console.log("⚠️ BACKEND: User already exists:", {
        phone: existingUser.phone,
        idx: existingUser.idx,
        created_at: existingUser.created_at
      });
    } else {
      console.log("✅ BACKEND: New user - will create new entry");
    }
    
    const { data: user, error } = await supabase.from("users").upsert({
      phone: normalizedPhone,
      gender,
      age,
      location: city,
      fcm_token
    }, {
      onConflict: "phone"
    }).select("*").single();
    
    if (error) {
      console.error("❌ BACKEND: Upsert error:", error);
      console.error("❌ BACKEND: Upsert error details:", JSON.stringify(error, null, 2));
      throw error;
    }
    
    if (!user) {
      console.error("❌ BACKEND: Upsert returned no user data");
      throw new Error("Failed to create/update user - no data returned");
    }
    
    if (!user.phone) {
      console.error("❌ BACKEND: User object missing phone:", JSON.stringify(user));
      throw new Error("User created but phone is missing");
    }
    
    // Verify phone number matches (check for duplicates)
    const { data: duplicateCheck } = await supabase
      .from("users")
      .select("phone, idx")
      .eq("phone", normalizedPhone);
    
    if (duplicateCheck && duplicateCheck.length > 1) {
      console.error("🚨 BACKEND: DUPLICATE DETECTED! Found", duplicateCheck.length, "entries for phone:", normalizedPhone);
      console.error("🚨 BACKEND: Duplicate entries:", JSON.stringify(duplicateCheck, null, 2));
    } else {
      console.log("✅ BACKEND: No duplicates found - phone is unique");
    }
    
    console.log("✅ BACKEND: Upsert successful. User data:", {
      phone: user.phone,
      hasGender: !!user.gender,
      hasAge: !!user.age,
      hasLocation: !!user.location,
      hasFcmToken: !!user.fcm_token
    });
    
    console.log("\n=== BACKEND: TOKEN GENERATION ===");
    console.log("DEBUG: JWT_SECRET exists:", !!JWT_SECRET);
    console.log("DEBUG: JWT_SECRET length:", JWT_SECRET ? JWT_SECRET.length : 0);
    console.log("DEBUG: Token payload will be:", { phone: user.phone });
    
    let app_key;
    try {
      app_key = await new jose.SignJWT({
        phone: user.phone
      }).setProtectedHeader({
        alg: "HS256"
      }).setIssuedAt().setExpirationTime("30s").sign(new TextEncoder().encode(JWT_SECRET));
      console.log("✅ BACKEND: Token generated successfully");
      console.log("DEBUG: Token length:", app_key.length);
      console.log("DEBUG: Token preview (first 50):", app_key.substring(0, 50) + "...");
      console.log("DEBUG: Token preview (last 50):", "..." + app_key.substring(app_key.length - 50));
    } catch (tokenError: any) {
      console.error("❌ BACKEND: Token generation failed:", tokenError.message);
      console.error("DEBUG: Token error stack:", tokenError.stack);
      throw new Error(`Token generation failed: ${tokenError.message}`);
    }
    
    console.log("\n=== BACKEND: RESPONSE PREPARATION ===");
    const responseBody = {
      success: true,
      app_key,
      phone: user.phone
    };
    console.log("DEBUG: Response body keys:", Object.keys(responseBody));
    console.log("DEBUG: Response success:", responseBody.success);
    console.log("DEBUG: Response app_key exists:", !!responseBody.app_key);
    console.log("DEBUG: Response app_key length:", responseBody.app_key?.length || 0);
    console.log("DEBUG: Response phone exists:", !!responseBody.phone);
    console.log("DEBUG: Response phone:", responseBody.phone);
    
    console.log("✅ BACKEND: Registration complete. Phone:", user.phone);
    console.log("✅ BACKEND: Sending 200 response with token and phone");
    
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  } catch (e: any) {
    console.error("\n❌ BACKEND: Register error:", e.message);
    console.error("DEBUG: Error type:", e.name);
    console.error("DEBUG: Full error stack:", e.stack);
    console.error("DEBUG: Error occurred at:", new Date().toISOString());
    
    // Ensure we ALWAYS return JSON, never HTML
    const errorResponse = {
      error: e.message || "Registration failed",
      // Include error type for debugging (but don't expose sensitive details)
      errorType: e.name || "UnknownError"
    };
    
    console.log("DEBUG: Error response:", JSON.stringify(errorResponse));
    console.log("DEBUG: Returning 500 status");
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  }
});
