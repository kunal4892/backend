
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");

console.log("=== get_messages: Environment check ===");
console.log("SUPABASE_URL exists:", !!SUPABASE_URL);
console.log("SERVICE_ROLE_KEY exists:", !!SERVICE_ROLE_KEY);
console.log("JWT_SECRET exists:", !!JWT_SECRET);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !JWT_SECRET) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
serve(async (req)=>{
  console.log("=== get_messages: Request received ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: cors()
    });
  }
  
  try {
    // --- 1️⃣ Verify token and auto-refresh if expired ---
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    let authResult;
    try {
      authResult = await verifyAndRefreshToken(authHeader);
      console.log("✅ Auth successful, phone:", authResult.phone);
      if (authResult.wasRefreshed) {
        console.log("🔄 Token was refreshed");
      }
    } catch (authError: any) {
      console.error("❌ Auth failed:", authError.message);
      return new Response(JSON.stringify({
        error: authError.message
      }), {
        status: 401,
        headers: cors()
      });
    }
    
    const phone = authResult.phone;
    
    // --- 3️⃣ Parse body for persona and pagination ---
    const body = await req.json();
    console.log("Request body:", body);
    
    const { personaId, page = 0, pageSize = 100 } = body;
    if (!personaId) {
      console.log("❌ Missing personaId");
      return new Response(JSON.stringify({
        error: "Missing personaId"
      }), {
        status: 400,
        headers: cors()
      });
    }
    
    console.log("Looking for thread with phone:", phone, "personaId:", personaId);
    // --- 4️⃣ Fetch the thread for this phone + persona ---
    const { data: thread, error: threadError } = await supabase
      .from("threads")
      .select("*")
      .eq("phone", phone)
      .eq("persona_id", personaId)
      .maybeSingle(); // Use maybeSingle() instead of single()
    
    if (threadError) {
      console.error("❌ Thread fetch error:", threadError);
      return new Response(JSON.stringify({
        error: "Failed to fetch thread"
      }), {
        status: 500,
        headers: cors()
      });
    }
    
    console.log("Thread found:", !!thread);
    if (thread) {
      console.log("Thread ID:", thread.id);
    }
    
    if (!thread) {
      // No thread exists yet for this user-persona pair
      console.log("No thread found, returning empty messages");
      return new Response(JSON.stringify({
        messages: [],
        thread: null
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...cors()
        }
      });
    }
    
    // --- 5️⃣ Use thread.id to fetch messages ---
    const from = page * pageSize;
    const to = from + pageSize - 1;
    console.log("Fetching messages for thread:", thread.id, "page:", page, "pageSize:", pageSize);
    
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .range(from, to);
    
    if (msgError) {
      console.error("❌ Message fetch error:", msgError);
      return new Response(JSON.stringify({
        error: "Failed to fetch messages"
      }), {
        status: 500,
        headers: cors()
      });
    }
    
    console.log("Messages found:", messages?.length || 0);
    
    // --- 6️⃣ Return both thread info + messages (+ new token if refreshed) ---
    const response: any = {
      thread,
      messages: messages || []
    };
    
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
  } catch (e) {
    console.error("❌ get-messages error:", e);
    return new Response(JSON.stringify({
      error: "Unexpected server error"
    }), {
      status: 500,
      headers: cors()
    });
  }
});
