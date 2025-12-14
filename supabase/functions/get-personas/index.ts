import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";
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
  console.log("\n==========================================");
  console.log("=== BACKEND: get-personas REQUEST RECEIVED ===");
  console.log("==========================================");
  console.log("DEBUG: Timestamp:", new Date().toISOString());
  console.log("DEBUG: Request method:", req.method);
  console.log("DEBUG: Request URL:", req.url);
  console.log("DEBUG: Request path:", new URL(req.url).pathname);
  console.log("DEBUG: All headers:", JSON.stringify(Object.fromEntries(req.headers.entries()), null, 2));
  
  // handle CORS
  if (req.method === "OPTIONS") {
    console.log("DEBUG: Handling OPTIONS preflight");
    return new Response("ok", {
      status: 204,
      headers: cors()
    });
  }
  try {
    // Verify token and auto-refresh if expired
    console.log("\n=== BACKEND: AUTH VERIFICATION ===");
    const authHeader = req.headers.get("Authorization");
    console.log("DEBUG: Auth header exists:", !!authHeader);
    console.log("DEBUG: Auth header:", authHeader ? `${authHeader.substring(0, 50)}...` : "MISSING");
    console.log("DEBUG: Auth header full length:", authHeader?.length || 0);
    
    let authResult;
    try {
      console.log("🔍 BACKEND: Calling verifyAndRefreshToken...");
      authResult = await verifyAndRefreshToken(authHeader, req);
      console.log("✅ BACKEND: Auth successful, phone:", authResult.phone);
      console.log("🔍 BACKEND: Token refresh status - wasRefreshed:", authResult.wasRefreshed);
      console.log("🔍 BACKEND: Token refresh status - hasNewToken:", !!authResult.newToken);
      if (authResult.wasRefreshed) {
        console.log("🔄 BACKEND: Token was refreshed, will return new token to client");
        console.log("🔄 BACKEND: New token preview:", authResult.newToken?.substring(0, 50) + "...");
      } else {
        console.log("✅ BACKEND: Token is still valid, no refresh needed");
      }
    } catch (authError: any) {
      console.error("❌ BACKEND: Auth failed in get-personas:");
      console.error("  - Error message:", authError.message);
      console.error("  - Error name:", authError.name);
      console.error("  - Error stack:", authError.stack);
      console.error("  - Auth header preview:", authHeader ? `${authHeader.substring(0, 50)}...` : "MISSING");
      
      return new Response(JSON.stringify({
        code: 401,
        message: authError.message || "Invalid JWT"
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    
    const phone = authResult.phone;
    // accept both GET (no body) and POST (with JSON body)
    console.log("\n=== BACKEND: BODY PARSING ===");
    let body: any = {};
    if (req.method === "POST") {
    try {
      body = await req.json();
      console.log("DEBUG: Parsed body:", JSON.stringify(body));
      } catch (e) {
        console.log("DEBUG: Failed to parse POST body:", e);
      }
    } else {
      console.log("DEBUG: GET request - no body to parse");
    }
    const { id } = body || {};
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
    
    // Build response - include new token if it was refreshed
    const response: any = { data };
    if (authResult.wasRefreshed) {
      response.new_token = authResult.newToken;
      console.log("🔄 Including new token in response");
    }
    
    return new Response(JSON.stringify(response), {
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
