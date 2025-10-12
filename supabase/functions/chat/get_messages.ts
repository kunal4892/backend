// import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// // 🔹 Initialize Supabase client
// const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
// serve(async (req)=>{
//   // Handle CORS preflight
//   if (req.method === "OPTIONS") {
//     return new Response("ok", {
//       headers: {
//         "Access-Control-Allow-Origin": "*",
//         "Access-Control-Allow-Methods": "POST, OPTIONS",
//         "Access-Control-Allow-Headers": "Content-Type, Authorization"
//       }
//     });
//   }
//   try {
//     const { phone, personaId, page = 0, pageSize = 100 } = await req.json();
//     if (!phone || !personaId) {
//       return new Response(JSON.stringify({
//         error: "Missing phone or personaId"
//       }), {
//         status: 400,
//         headers: {
//           "Content-Type": "application/json"
//         }
//       });
//     }
//     // 1️⃣ Find the existing thread for this user + persona
//     const { data: thread, error: threadError } = await supabase.from("threads").select("id").eq("phone", phone).eq("persona_id", personaId).order("created_at", {
//       ascending: false
//     }).limit(1).single();
//     if (threadError || !thread) {
//       console.warn("⚠️ No thread found for", phone, personaId);
//       return new Response(JSON.stringify({
//         messages: []
//       }), {
//         headers: {
//           "Access-Control-Allow-Origin": "*",
//           "Content-Type": "application/json"
//         }
//       });
//     }
//     // 2️⃣ Pagination setup
//     const from = page * pageSize;
//     const to = from + pageSize - 1;
//     // 3️⃣ Fetch messages for that thread
//     const { data: messages, error: msgError } = await supabase.from("messages").select("*").eq("thread_id", thread.id).order("created_at", {
//       ascending: true
//     }).range(from, to);
//     if (msgError) {
//       console.error("❌ get-messages db error:", msgError);
//       return new Response(JSON.stringify({
//         error: msgError
//       }), {
//         status: 500,
//         headers: {
//           "Content-Type": "application/json"
//         }
//       });
//     }
//     return new Response(JSON.stringify({
//       messages
//     }), {
//       headers: {
//         "Access-Control-Allow-Origin": "*",
//         "Content-Type": "application/json"
//       }
//     });
//   } catch (err) {
//     console.error("❌ get-messages error:", err);
//     return new Response(JSON.stringify({
//       error: err.message
//     }), {
//       status: 500,
//       headers: {
//         "Access-Control-Allow-Origin": "*",
//         "Content-Type": "application/json"
//       }
//     });
//   }
// });
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: cors()
    });
  }
  try {
    // --- 1️⃣ Extract JWT from Authorization header ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({
        error: "Missing or invalid Authorization header"
      }), {
        status: 401,
        headers: cors()
      });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({
        error: "Empty token"
      }), {
        status: 401,
        headers: cors()
      });
    }
    // --- 2️⃣ Verify and decode JWT ---
    let phone;
    try {
      const decoded = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
      phone = decoded.payload.phone;
    } catch (err) {
      console.error("JWT verify failed:", err);
      return new Response(JSON.stringify({
        error: "Invalid or expired token"
      }), {
        status: 401,
        headers: cors()
      });
    }
    if (!phone) {
      return new Response(JSON.stringify({
        error: "No phone found in token"
      }), {
        status: 400,
        headers: cors()
      });
    }
    // --- 3️⃣ Parse body for persona and pagination ---
    const { personaId, page = 0, pageSize = 100 } = await req.json();
    if (!personaId) {
      return new Response(JSON.stringify({
        error: "Missing personaId"
      }), {
        status: 400,
        headers: cors()
      });
    }
    // --- 4️⃣ Fetch the thread for this phone + persona ---
    const { data: thread, error: threadError } = await supabase.from("threads").select("*").eq("phone", phone).eq("persona_id", personaId).single();
    if (threadError) {
      console.error("❌ Thread fetch error:", threadError);
      return new Response(JSON.stringify({
        error: "Failed to fetch thread"
      }), {
        status: 500,
        headers: cors()
      });
    }
    if (!thread) {
      // No thread exists yet for this user-persona pair
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
    const { data: messages, error: msgError } = await supabase.from("messages").select("*").eq("thread_id", thread.id).order("created_at", {
      ascending: true
    }) // chronological order
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
    // --- 6️⃣ Return both thread info + messages ---
    return new Response(JSON.stringify({
      thread,
      messages
    }), {
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
