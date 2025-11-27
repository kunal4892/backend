// supabase/functions/chat-handler/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";
import { buildPersonaContext } from "./utils/personaUtils.ts";

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
// Use WORKING model - gemini-2.5-pro (same as notifications)
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=" + GEMINI_API_KEY;
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
    const t0 = Date.now();
    
    // --- 1️⃣ Fast token verification (no DB call) ---
    const authHeader = req.headers.get("Authorization");
    
    let authResult;
    try {
      authResult = await verifyAndRefreshToken(authHeader, req);
    } catch (authError: any) {
      console.error("❌ Auth failed:", authError.message);
      return json({ error: authError.message }, 401);
    }
    
    const tAuth = Date.now();
    console.log(`⏱️ Auth (fast): ${tAuth - t0}ms`);
    if (authResult.wasRefreshed) {
      console.log("🔄 Token was refreshed, will return new token to client");
    }
    
    const phone = authResult.phone;
    
    // --- 2️⃣ Parse body ---
    const body = await req.json();
    const { personaId, text } = body;
    
    if (!personaId || !text) {
      return json({ error: "Missing personaId or text" }, 400);
    }
    
    /* ---------------------------------------------------------------------- */ /*             Step 1: Get thread + persona in parallel                   */ /* ---------------------------------------------------------------------- */ const [{ thread }, { persona }] = await Promise.all([
      getOrCreateThread(phone, personaId),
      getPersona(personaId)
    ]);
    const t1 = Date.now();
    console.log(`⏱️ Thread+Persona: ${t1 - t0}ms`);
    
    /* ---------------------------------------------------------------------- */ /*             Step 2: Fetch history + build context in parallel          */ /* ---------------------------------------------------------------------- */ const [{ data: history }, personaContext] = await Promise.all([
      supabase.from("messages")
        .select("role, text")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
        .limit(10),  // Reduced from 20 to 10 (faster)
      Promise.resolve(buildPersonaContext(persona, phone, false))
    ]);
    const t2 = Date.now();
    console.log(`⏱️ History+Context: ${t2 - t1}ms (${history?.length || 0} msgs)`);
    const contents: any[] = [];
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
    // Append current user message (without persona context)
    contents.push({
      role: "user",
      parts: [
        {
          text: text
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
    /* ---------------------------------------------------------------------- */ /*                           Gemini API Call                              */ /* ---------------------------------------------------------------------- */
    const controller = new AbortController();

    
    // Build request body with system instruction if persona context exists
    const requestBody: any = {
      contents,
      generationConfig: {
        candidateCount: 2,  // Get 2 candidates for variety
        temperature: 0.9,
        maxOutputTokens: 2048  // Increased to prevent MAX_TOKENS truncation
      }
    };
    
    // Add persona context as system instruction
    if (personaContext) {
      requestBody.systemInstruction = {
        parts: [{ text: personaContext }]
      };
    }
    
    const t3 = Date.now();
    console.log("🚀 Sending request to Gemini:", GEMINI_URL);
    console.log("📋 Request body:", JSON.stringify(requestBody, null, 2));
    
    const r = await fetch(GEMINI_URL, {
      method: "POST",
      // Remove signal (like notifications)
      // signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }).catch((e)=>{
      console.error("❌ Gemini fetch failed:", e.message);
      throw new Error("Gemini request failed: " + e.message);
    });
    const t4 = Date.now();
    console.log(`⏱️ Gemini API: ${t4 - t3}ms`);
    console.log("📊 Gemini response status:", r.status);
    
    const raw = await r.text();
    console.log("📄 Gemini raw response:", raw.slice(0, 1000));
    
    // Check if Gemini returned an error
    if (!r.ok) {
      console.error("❌ Gemini API error - Status:", r.status);
      console.error("❌ Gemini API error - Response:", raw);
      let errorMessage = `Gemini API error (${r.status})`;
      try {
        const errorData = JSON.parse(raw);
        errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
        console.error("❌ Gemini error details:", JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.error("❌ Could not parse Gemini error response");
      }
      throw new Error(errorMessage);
    }
    
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch (parseError) {
      console.error("❌ Gemini non-JSON:", raw.slice(0, 500));
      console.error("❌ Parse error:", parseError);
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
    console.log("📊 Gemini candidates count:", candidates.length);
    
    let chosenReply = "";
    
    // Strategy: Pick the FIRST candidate (most reliable)
    const candidateIndex = 0;
    
    if (candidates[candidateIndex]) {
      chosenReply = candidates[candidateIndex]?.content?.parts?.[0]?.text?.trim() || "";
      console.log(`✅ Chose candidate #${candidateIndex + 1} (first - most reliable)`);
    }
    
    // Fallback: try any available candidate if chosen one is empty
    if (!chosenReply) {
      console.log("⚠️ Chosen candidate empty, trying others...");
      for (const c of candidates) {
        const txt = c?.content?.parts?.[0]?.text?.trim();
        if (txt) {
          chosenReply = txt;
          break;
        }
      }
    }
    
    // Check if response was cut off due to MAX_TOKENS
    if (!chosenReply && candidates.length > 0) {
      const firstCandidate = candidates[0];
      const finishReason = firstCandidate?.finishReason;
      
      if (finishReason === "MAX_TOKENS") {
        // Funky message for token limit
        const funkyMessages = [
          "Arre yaar, maine itna bol diya ki system ne cut kar diya! 😅 Baat adhuri reh gayi, phir se try karo?",
          "Oops! Main itna excited ho gaya ki response limit cross ho gaya 😂 Dobara bolo, abhi short mein reply dunga!",
          "Haha, maine itna bolna chaha ki token limit hit ho gayi! 🎉 Chalo, ek aur try?",
          "Arre wah! Itna lamba reply banaya ki system ne cut button dab diya 😜 Chhoti baat karo, main bhi chhota reply dunga!",
          "System ne kaha: Bhai, itna mat bol! 😂 Token limit hit ho gayi. Dobara try?",
          "Main itna bol gaya ki response ka size limit cross ho gaya! 🚀 Chalo, phir se shuru karte hain?",
          "Oops! Response itna lamba ho gaya ki system ne pause button dab diya 😅 Short mein bolo, main bhi short reply dunga!"
        ];
        const funkyMessage = funkyMessages[Math.floor(Math.random() * funkyMessages.length)];
        await insertBotBubble(thread.id, funkyMessage);
        return json({
          threadId: thread.id,
          replies: [
            funkyMessage
          ],
          messages: []
        });
      }
    }
    
    if (!chosenReply) {
      const fallback = "⚠️ Gemini didn't respond or filtered this message.";
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
    console.log(`📦 Split into ${bubbles.length} bubbles`);
    
    // Insert all bubbles in parallel (faster!)
    const t5 = Date.now();
    const botMessages = await Promise.all(
      bubbles.map(bubble => insertBotBubble(thread.id, bubble))
    );
    const t6 = Date.now();
    console.log(`⏱️ Insert bubbles: ${t6 - t5}ms`);
    
    // Update thread timestamp (non-blocking)
    supabase.from("threads").update({
      updated_at: new Date().toISOString()
    }).eq("id", thread.id);
    
    // Topic extraction disabled for performance
    // Re-enable by uncommenting if needed
    // const messageCount = (history?.length || 0) + 1;
    // if (messageCount % 5 === 0) {
    //   fetch(`${supabaseUrl}/functions/v1/extract-topics`, {...});
    // }
    
    const totalTime = t6 - t0;
    console.log(`⚡ TOTAL: ${totalTime}ms (Auth→Persona: ${t1-t0}ms | History: ${t2-t1}ms | Gemini: ${t4-t3}ms | DB: ${t6-t5}ms)`);
    
    // Build response (no token refresh in fast path)
    const response: any = {
      threadId: thread.id,
      replies: bubbles,
      messages: botMessages
    };
    
    // Include new token if it was refreshed
    if (authResult.wasRefreshed && authResult.newToken) {
      response.new_token = authResult.newToken;
      console.log("🔄 Including new token in response");
    }
    
    return json(response);
  } catch (err) {
    console.error("❌ chat-handler error:", err);
    return json({
      error: err.message ?? String(err)
    }, 500);
  }
});
/* -------------------------------------------------------------------------- */ /*                             Helper functions                               */ /* -------------------------------------------------------------------------- */ async function getOrCreateThread(phone, personaId) {
  // Find existing thread
  const { data: thread, error } = await supabase
    .from("threads")
    .select("*")
    .eq("phone", phone)
    .eq("persona_id", personaId)
    .maybeSingle();
  
  if (error) throw error;
  if (thread) return { thread };
  
  // Create new thread
  const res = await supabase.from("threads").insert({
    phone,
    persona_id: personaId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).select().single();
  
  if (res.error) throw res.error;
  return { thread: res.data };
}
async function getPersona(personaId) {
  const { data, error } = await supabase.from("personas").select("*").eq("id", personaId).single();
  if (error) throw error;
  return {
    persona: data
  };
}
async function insertBotBubble(threadId, text) {
  const { data, error } = await supabase.from("messages").insert({
    thread_id: threadId,
    role: "bot",
    text,
    created_at: new Date().toISOString()
  }).select().single();
  if (error) console.error("❌ insertBotBubble error:", error.message);
  return data;
}

function splitReplyIntoBubbles(text) {
  // Clean up - use placeholder to protect &&&
  const PLACEHOLDER = "___BUBBLE_SPLIT___";
  
  let cleanedText = text.trim()
    .replace(/&{4,}/g, '&&&')              // Normalize &&&& → &&&
    .replace(/\s*&&&\s*/g, PLACEHOLDER)    // Replace &&& with placeholder
    .replace(/&+/g, '')                    // Remove ALL other ampersands
    .replace(new RegExp(PLACEHOLDER, 'g'), '&&&')  // Restore &&&
    .trim();
  
  // Check if AI used &&& delimiter
  if (cleanedText.includes("&&&")) {
    return cleanedText
      .split("&&&")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  
  // Fallback: Split by paragraphs or sentences
  const paragraphs = cleanedText.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  if (paragraphs.length > 1 && paragraphs.length <= 4) {
    return paragraphs;
  }
  
  // Split long messages by sentences
  if (cleanedText.length > 150) {
    const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];
    if (sentences.length >= 2) {
      const mid = Math.ceil(sentences.length / 2);
      return [
        sentences.slice(0, mid).join(" ").trim(),
        sentences.slice(mid).join(" ").trim()
      ].filter(Boolean);
    }
  }
  
  return [cleanedText];
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
