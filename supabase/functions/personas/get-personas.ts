import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
console.log("=== BACKEND: getPersonas STARTUP DEBUG ===");
console.log("DEBUG: SUPABASE_URL exists?", !!SUPABASE_URL);
console.log("DEBUG: SUPABASE_SERVICE_ROLE_KEY exists?", !!SUPABASE_SERVICE_ROLE_KEY);
console.log("DEBUG: JWT_SECRET exists?", !!JWT_SECRET);
console.log("DEBUG: JWT_SECRET length:", JWT_SECRET ? JWT_SECRET.length : 0);
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
  throw new Error("Missing Supabase environment variables");
}
// create a supabase client using the SERVICE ROLE key (server-side)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type"
  };
}
serve(async (req)=>{
  console.log("\n=== BACKEND: getPersonas REQUEST RECEIVED ===");
  console.log("DEBUG: Request method:", req.method);
  console.log("DEBUG: Request URL:", req.url);
  // handle CORS
  if (req.method === "OPTIONS") {
    console.log("DEBUG: Handling OPTIONS preflight");
    return new Response("ok", {
      status: 204,
      headers: cors()
    });
  }
  try {
    // Extract and validate JWT from Authorization header
    console.log("\n=== BACKEND: AUTH EXTRACTION ===");
    const authHeader = req.headers.get("Authorization");
    console.log("DEBUG: Auth header:", authHeader ? `${authHeader.substring(0, 20)}...` : "MISSING");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("❌ BACKEND: Missing or invalid Authorization header");
      return new Response(JSON.stringify({
        error: "Missing or invalid Authorization header"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    console.log("DEBUG: Extracted token length:", token.length);
    console.log("DEBUG: Token parts:", token.split('.').length); // Should be 3
    let payload;
    console.log("\n=== BACKEND: JWT VERIFICATION ===");
    try {
      const { payload: verifiedPayload } = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
      payload = verifiedPayload;
      console.log("✅ BACKEND: JWT verified successfully");
      console.log("DEBUG: Verified payload keys:", Object.keys(payload));
      console.log("DEBUG: Payload iat:", payload.iat);
      console.log("DEBUG: Payload exp:", payload.exp);
    } catch (jwtError) {
      console.error("❌ BACKEND: JWT verification error:", jwtError.message);
      console.error("DEBUG: Full JWT error:", jwtError);
      return new Response(JSON.stringify({
        error: "Invalid or expired token"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    console.log(payload);
    const phone = payload.phone;
    console.log("\n=== BACKEND: PAYLOAD VALIDATION ===");
    console.log("DEBUG: Extracted user_id:", phone);
    if (!phone) {
      console.error("❌ BACKEND: Invalid token payload (no phone)");
      return new Response(JSON.stringify({
        error: "Invalid token payload"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    console.log("✅ BACKEND: Authenticated phone:", phone);
    // accept both GET (no body) and POST (with JSON body)
    console.log("\n=== BACKEND: BODY PARSING ===");
    let body = {};
    try {
      body = await req.json();
      console.log("DEBUG: Parsed body:", JSON.stringify(body));
    } catch  {
      console.log("DEBUG: No body (GET request or empty)");
    }
    const { id } = body;
    console.log("DEBUG: Requested ID:", id || "all");
    // build query
    console.log("\n=== BACKEND: QUERY BUILDING ===");
    let query = supabase.from("personas").select("*");
    if (id) {
      query = query.eq("id", id);
      console.log("DEBUG: Added ID filter:", id);
    }
    // Optionally, add user_id filter if personas are user-specific: .eq("user_id", user_id)
    // For now, assuming personas are global/public after auth
    console.log("DEBUG: Executing query...");
    const { data, error } = await query;
    if (error) {
      console.error("❌ BACKEND: getPersonas query error:", error.message);
      console.error("DEBUG: Full query error:", error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    console.log("✅ BACKEND: Query successful. Data count:", data ? data.length : 0);
    // success
    console.log("\n=== BACKEND: RESPONSE ===");
    console.log("DEBUG: Returning data length:", data ? data.length : 0);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  } catch (err) {
    console.error("\n❌ BACKEND: getPersonas server error:", err.message);
    console.error("DEBUG: Full server error stack:", err.stack);
    return new Response(JSON.stringify({
      error: String(err?.message || err)
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  }
});
