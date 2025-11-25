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
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors()
    });
  }
  
  // Ensure we always return JSON, even for parsing errors
  let body;
  try {
    body = await req.json();
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
    
    // Support both encrypted (mobile) and simple (web) registration
    let phone: string;
    let fcm_token: string | undefined;
    let gender: string | undefined;
    let age: number | undefined;
    let city: string | undefined;
    
    if (body.phone) {
      // Simple web registration - no encryption needed
      console.log("DEBUG: Simple web registration detected");
      phone = body.phone;
      fcm_token = body.fcm_token;
      gender = body.gender;
      age = body.age;
      city = body.city || body.location;
    } else {
      // Encrypted mobile registration
      const { encrypted_key, iv, payload } = body;
      console.log("DEBUG: Encrypted mobile registration detected");
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
      const obj = JSON.parse(plaintext);
      console.log("DEBUG: Parsed JSON keys:", Object.keys(obj));
      phone = obj.phone;
      fcm_token = obj.fcm_token;
      gender = obj.gender;
      age = obj.age;
      city = obj.city;
    }
    
    if (!phone) throw new Error("Phone number is required");
    console.log("\n=== BACKEND: USER REGISTRATION ===");
    console.log("DEBUG: Registering user:", {
      phone,
      gender,
      age,
      city,
      fcm_token: fcm_token ? `${fcm_token.substring(0, 20)}...` : "null" // Truncate for logs
    });
    const { data: user, error } = await supabase.from("users").upsert({
      phone,
      gender,
      age,
      location: city,
      fcm_token
    }, {
      onConflict: "phone"
    }).select("*").single();
    if (error) throw error;
    const app_key = await new jose.SignJWT({
      phone: user.phone
    }).setProtectedHeader({
      alg: "HS256"
    }).setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(JWT_SECRET));
    console.log("✅ BACKEND: Registration complete. User ID:", user.id);
    return new Response(JSON.stringify({
      success: true,
      app_key
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  } catch (e: any) {
    console.error("\n❌ BACKEND: Register error:", e.message);
    console.error("DEBUG: Full error stack:", e.stack);
    
    // Ensure we ALWAYS return JSON, never HTML
    const errorResponse = {
      error: e.message || "Registration failed",
      // Include error type for debugging (but don't expose sensitive details)
      errorType: e.name || "UnknownError"
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  }
});
