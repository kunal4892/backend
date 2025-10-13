// supabase/functions/chat-handler/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

// ✅ Supabase + Gemini setup
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

console.log("=== chat-handler: Environment check ===");
console.log("SUPABASE_URL exists:", !!supabaseUrl);
console.log("SERVICE_ROLE_KEY exists:", !!supabaseKey);
console.log("JWT_SECRET exists:", !!JWT_SECRET);
console.log("GEMINI_API_KEY exists:", !!GEMINI_API_KEY);

if (!supabaseUrl || !supabaseKey || !JWT_SECRET || !GEMINI_API_KEY) {
  throw new Error("Missing required environment variables");
}

// ✅ Use lightweight + fast model
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY;
const PERSONA_MANAGER_URL = `${supabaseUrl}/functions/v1/persona-manager`;
/* -------------------------------------------------------------------------- */ /*                                Main Handler                                */ /* -------------------------------------------------------------------------- */ serve(async (req)=>{
  console.log("=== chat-handler: Request received ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors()
    });
  }
  
  try {
    // --- 1️⃣ Extract JWT from Authorization header ---
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid Authorization header");
      return json({
        error: "Missing or invalid Authorization header"
      }, 401);
    }
    
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      console.log("❌ Empty token");
      return json({
        error: "Empty token"
      }, 401);
    }
    
    // --- 2️⃣ Verify and decode JWT ---
    let phone;
    try {
      const decoded = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
      phone = decoded.payload.phone;
      console.log("✅ JWT verified, phone:", phone);
    } catch (err) {
      console.error("❌ JWT verify failed:", err);
      return json({
        error: "Invalid or expired token"
      }, 401);
    }
    
    if (!phone) {
      console.log("❌ No phone found in token");
      return json({
        error: "No phone found in token"
      }, 400);
    }
    
    // --- 3️⃣ Parse body for persona and message ---
    const body = await req.json();
    console.log("Request body:", body);
    
    const { personaId, text } = body;
    if (!personaId || !text) {
      console.log("❌ Missing personaId or text");
      return json({
        error: "Missing personaId or text"
      }, 400);
    }
    
    console.log("Processing chat for phone:", phone, "personaId:", personaId);
    const startTime = Date.now();
    /* ---------------------------------------------------------------------- */ /*                     Parallel thread + persona fetch                    */ /* ---------------------------------------------------------------------- */ const [{ thread }, { persona }] = await Promise.all([
      getOrCreateThread(phone, personaId),
      getPersona(personaId)
    ]);
    /* ---------------------------------------------------------------------- */ /*                     Summarize + Context (in parallel)                  */ /* ---------------------------------------------------------------------- */ const tasks = [];
    // Only summarize if missing
    if (!persona.short_summary && persona.long_doc) {
      tasks.push(fetch(PERSONA_MANAGER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          action: "summarizeIfNeeded",
          personaId,
          phone,
          personaData: persona
        })
      }).then((r)=>r.json()));
    }
    // Always build context
    tasks.push(fetch(PERSONA_MANAGER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        action: "buildContext",
        personaId,
        phone,
        personaData: persona,
        isFirst: false
      })
    }).then((r)=>r.json()));
    const [summaryData, contextData] = await Promise.all(tasks);
    if (summaryData?.summary && !persona.short_summary) {
      persona.short_summary = summaryData.summary;
    }
    const personaContext = contextData?.context || "";
    console.log("PersonaContext", personaContext);
    /* ---------------------------------------------------------------------- */ /*                       Fetch last 20 messages                           */ /* ---------------------------------------------------------------------- */ const { data: history } = await supabase.from("messages").select("role, text").eq("thread_id", thread.id).order("created_at", {
      ascending: true
    }).limit(20);
    const contents = [];
    for (const m of history || []){
      const role = m.role === "bot" ? "model" : "user";
      contents.push({
        role,
        parts: [
          {
            text: m.text
          }
        ]
      });
    }
    // Append current user message
    const inputText = personaContext ? `${personaContext}\n\n${text}` : text;
    contents.push({
      role: "user",
      parts: [
        {
          text: inputText
        }
      ]
    });
    // Save user message (non-blocking)
    supabase.from("messages").insert({
      thread_id: thread.id,
      role: "user",
      text,
      created_at: new Date().toISOString()
    }).then(({ error })=>error && console.error("⚠️ user insert error:", error.message));
    /* ---------------------------------------------------------------------- */ /*                           Gemini API Call                              */ /* ---------------------------------------------------------------------- */ // console log on contents being sent to gemini
    console.log(contents);
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), 15000); // 15s timeout
    const r = await fetch(GEMINI_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          candidateCount: 2,
          temperature: 0.9
        }
      })
    }).catch((e)=>{
      clearTimeout(timeout);
      throw new Error("Gemini request failed: " + e.message);
    });
    clearTimeout(timeout);
    const raw = await r.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch  {
      console.error("❌ Gemini non-JSON:", raw.slice(0, 500));
      throw new Error("Invalid Gemini response");
    }
    // Handle safety or empty replies
    if (data.promptFeedback?.blockReason) {
      const warning = "⚠️ Gemini blocked this message for safety reasons.";
      await insertBotBubble(thread.id, warning);
      return json({
        threadId: thread.id,
        replies: [
          warning
        ],
        messages: []
      });
    }
    const candidates = data?.candidates ?? [];
    let chosenReply = "";
    for (const c of candidates){
      const txt = c?.content?.parts?.[0]?.text?.trim();
      if (txt) {
        chosenReply = txt;
        break;
      }
    }
    if (!chosenReply) {
      const fallback = "⚠️ Gemini didn’t respond or filtered this message.";
      await insertBotBubble(thread.id, fallback);
      return json({
        threadId: thread.id,
        replies: [
          fallback
        ],
        messages: []
      });
    }
    const bubbles = splitReplyIntoBubbles(chosenReply);
    const botMessages = [];
    for (const bubble of bubbles){
      await insertBotBubble(thread.id, bubble, botMessages);
    }
    // Update thread timestamp (non-blocking)
    supabase.from("threads").update({
      updated_at: new Date().toISOString()
    }).eq("id", thread.id);
    console.log("⚡ Total response time:", Date.now() - startTime, "ms");
    return json({
      threadId: thread.id,
      replies: bubbles,
      messages: botMessages
    });
  } catch (err) {
    console.error("❌ chat-handler error:", err);
    return json({
      error: err.message ?? String(err)
    }, 500);
  }
});
/* -------------------------------------------------------------------------- */ /*                             Helper functions                               */ /* -------------------------------------------------------------------------- */ async function getOrCreateThread(phone, personaId) {
  console.log("Getting or creating thread for phone:", phone, "personaId:", personaId);
  
  // First try to find existing thread
  const { data: thread, error } = await supabase
    .from("threads")
    .select("*")
    .eq("phone", phone)
    .eq("persona_id", personaId)
    .maybeSingle();
  
  if (error) {
    console.error("❌ Error fetching thread:", error);
    throw error;
  }
  
  if (thread) {
    console.log("✅ Found existing thread:", thread.id);
    return { thread };
  }
  
  // Create new thread if not found
  console.log("Creating new thread for phone:", phone, "personaId:", personaId);
  const res = await supabase.from("threads").insert({
    phone,
    persona_id: personaId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select().single();
  
  if (res.error) {
    console.error("❌ Error creating thread:", res.error);
    throw res.error;
  }
  
  console.log("✅ Created new thread:", res.data.id);
  return { thread: res.data };
}
async function getPersona(personaId) {
  const { data, error } = await supabase.from("personas").select("*").eq("id", personaId).single();
  if (error) throw error;
  return {
    persona: data
  };
}
async function insertBotBubble(threadId, text, arr) {
  const { data, error } = await supabase.from("messages").insert({
    thread_id: threadId,
    role: "bot",
    text,
    created_at: new Date().toISOString()
  }).select().single();
  if (error) console.error("❌ insertBotBubble error:", error.message);
  if (arr) arr.push(data);
}
function splitReplyIntoBubbles(text) {
  return text.split("&&&").map((s)=>s.trim()).filter(Boolean);
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: cors()
  });
}
