/******************************************************************************************
 * 📍 persona-manager
 *
 * Handles:
 *  ✅ Building persona context (dynamically pulls style_prompt from DB)
 *  ✅ Constructs systemInstruction for AI chat requests
 ******************************************************************************************/ import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
// ---------------------------------------------------------------------------
// 🔧 Setup
// ---------------------------------------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);
// ---------------------------------------------------------------------------
// 🌐 Entry
// ---------------------------------------------------------------------------
serve(async (req)=>{
  try {
    if (req.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: cors()
    });
    
    // --- JWT Authentication (same as chat-handler) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({
        error: "Missing or invalid Authorization header"
      }, 401);
    }
    
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return json({
        error: "Empty token"
      }, 401);
    }
    
    // Verify JWT
    try {
      const decoded = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
      const phone = decoded.payload.phone;
      if (!phone) {
        return json({
          error: "No phone found in token"
        }, 400);
      }
    } catch (err) {
      console.error("❌ JWT verify failed:", err);
      return json({
        error: "Invalid or expired token"
      }, 401);
    }
    const { action, personaId, phone, personaData, isFirst } = await req.json();
    if (!action || !personaId || !phone) return json({
      error: "Missing required params"
    }, 400);
    // 🔹 Always fetch latest persona record from DB to get updated style_prompt etc.
    const { data: dbPersona, error: fetchErr } = await supabase.from("personas").select("*").eq("id", personaId).single();
    if (fetchErr || !dbPersona) console.warn("⚠️ Persona not found in DB, using provided personaData fallback.");
    // Merge DB persona (priority) with fallback personaData
    const persona = {
      ...personaData || {},
      ...dbPersona || {}
    };
    // -----------------------------------------------------------------------
    // 🎭 ACTIONS
    // -----------------------------------------------------------------------
    if (action === "buildContext") {
      const context = await buildPersonaContext(persona, phone, !!isFirst);
      return json({
        context
      });
    }
    
    return json({
      error: "Unknown action"
    }, 400);
  } catch (err) {
    console.error("❌ persona-manager error", err);
    return json({
      error: err?.message || String(err)
    }, 500);
  }
});
// ---------------------------------------------------------------------------
// 🧩 Helpers
// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// 🧠 Build Persona Context (now uses DB style_prompt)
// ---------------------------------------------------------------------------
async function buildPersonaContext(persona, phone, isFirst) {
  // 1️⃣ System prompt (base personality)
  const base = persona.system_prompt || "You are a helpful companion.";
  // 2️⃣ Prefer live-editable style_prompt from DB; fallback to legacy default
  const DEFAULT_STYLE = `
FORMATTING (MANDATORY):
Split your response into 2-3 short chat bubbles using &&&
Each bubble should be 1-3 sentences max (like WhatsApp messages).
Example: "Hey! Kaise ho?&&&Batao, kya chal raha hai?"

CRITICAL RULES:
- NEVER use single & in your response. Only use exactly three: &&&
- Keep bubbles SHORT (1-3 sentences each, not paragraphs)
- Most replies should be 2 bubbles, sometimes 3
- Don't write essays - this is casual chat!

LANGUAGE & STYLE:
- Speak Hinglish (casual, desi vibe) unless user prefers English
- Use "aap" unless user asks for "tu"
- Light emojis when it feels right
- Be yourself, not a template

CONVERSATION:
- The chat history above shows your past conversation with THIS user
- Remember what matters (names, feelings, important topics)
- Let conversation flow naturally — if they change topics, go with it
- Short replies like "ok" or "hmm" = time to move on
- Don't force topics or be pushy
`;
  const style = persona.style_prompt && persona.style_prompt.trim().length > 0 ? persona.style_prompt.trim() : DEFAULT_STYLE.trim();
  // 3️⃣ Pick full or short persona doc based on first chat
  const personaDoc = isFirst ? `Here is your full character profile:\n${persona.long_doc || ""}` : `Reminder of your persona:\n${persona.short_summary || persona.system_prompt || ""}`;
  // 4️⃣ Build and return final combined persona context
  return `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${persona.name}.\n\n${personaDoc}`;
}
