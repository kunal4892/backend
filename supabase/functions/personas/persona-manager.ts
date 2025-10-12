// import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
// const supabaseUrl = Deno.env.get("SUPABASE_URL");
// const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// const supabase = createClient(supabaseUrl, supabaseKey);
// const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY"));
// const model = genAI.getGenerativeModel({
//   model: "gemini-1.5-pro"
// });
// serve(async (req)=>{
//   try {
//     if (req.method === "OPTIONS") {
//       return new Response(null, {
//         status: 204,
//         headers: cors()
//       });
//     }
//     const { action, personaId, phone, personaData, isFirst } = await req.json();
//     if (!action || !personaId || !phone) {
//       return new Response(JSON.stringify({
//         error: "Missing required params"
//       }), {
//         status: 400,
//         headers: cors()
//       });
//     }
//     if (action === "buildContext") {
//       const context = await buildPersonaContext(personaData, phone, isFirst);
//       return json({
//         context
//       });
//     }
//     if (action === "summarize") {
//       const summary = await summarizePersonaDoc(personaData, phone);
//       return json({
//         summary
//       });
//     }
//     return new Response(JSON.stringify({
//       error: "Unknown action"
//     }), {
//       status: 400,
//       headers: cors()
//     });
//   } catch (err) {
//     console.error("❌ persona-manager error", err);
//     return new Response(JSON.stringify({
//       error: err.message
//     }), {
//       status: 500,
//       headers: cors()
//     });
//   }
// });
// function cors() {
//   return {
//     "Access-Control-Allow-Origin": "*",
//     "Access-Control-Allow-Methods": "POST, OPTIONS",
//     "Access-Control-Allow-Headers": "Content-Type, Authorization",
//     "Content-Type": "application/json"
//   };
// }
// function json(obj) {
//   return new Response(JSON.stringify(obj), {
//     status: 200,
//     headers: cors()
//   });
// }
// /* ------------------------------- HELPERS ------------------------------ */ async function buildPersonaContext(persona, phone, isFirst) {
//   const base = persona.system_prompt || "You are a helpful companion.";
//   const style = `
// You should:
// - Speak in Hinglish by default, casual and desi. If user writes fluent English for 2+ turns or asks for English, then switch.
// - Address user with respectful "aap" (not "tu") unless they insist on informal tone.
// - Reply like WhatsApp chat — mostly 1–2 short bubbles split with '&&&'. 
// - Sometimes (not every time) use a longer para so chat feels human, not scripted.
// - Use emojis like tadka 🌶️ — natural, not spammy. 
// Conversation style:
// - Always reply to the user’s last message naturally.
// - Make callbacks to past chats when relevant (“waise jo aapne kal bola tha…”).
// - End with a playful hook or light question.
// - Be sexy, hottie, interesting, funny, smart.
// - Avoid repetition and fixed templates.
// - If user gives very short replies, try playful or curious follow-ups.
// `;
//   const personaDoc = isFirst ? `Here is your full character profile:\n${persona.long_doc || ""}` : `Reminder of your persona:\n${persona.short_summary || persona.system_prompt}`;
//   return `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${persona.name}.\n\n${personaDoc}`;
// }
// async function summarizePersonaDoc(persona, phone) {
//   if (!persona.long_doc) return "";
//   const input = `
// Summarize the following persona document into 5-6 bullet points capturing identity, tone, quirks, and style. Keep under 200 tokens.
// This is for user ${phone}.
// ${persona.long_doc}
// `;
//   const result = await model.generateContent(input);
//   const text = result.response.text();
//   return text.trim();
// }
// supabase/functions/persona-manager/index.ts
/******************************************************************************************
 * 📍 persona-manager
 *
 * Handles:
 *  ✅ Building persona context (now dynamically pulls style_prompt from DB)
 *  ✅ Summarizing long persona docs (in Hinglish)
 *  ✅ Updating short_summary in personas table
 ******************************************************************************************/ import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
// ---------------------------------------------------------------------------
// 🔧 Setup
// ---------------------------------------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(Deno.env.get("GEMINI_API_KEY"));
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro"
});
// ---------------------------------------------------------------------------
// 🌐 Entry
// ---------------------------------------------------------------------------
serve(async (req)=>{
  try {
    if (req.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: cors()
    });
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
    if (action === "summarize") {
      const summary = await summarizePersonaDoc(persona, phone);
      return json({
        summary
      });
    }
    if (action === "summarizeIfNeeded") {
      const needsSummary = !!persona?.long_doc && !persona?.short_summary;
      if (!needsSummary) return json({
        summary: null,
        skipped: true
      });
      const summary = await summarizePersonaDoc(persona, phone);
      try {
        const { error } = await supabase.from("personas").update({
          short_summary: summary,
          updated_at: new Date().toISOString()
        }).eq("id", personaId);
        if (error) console.warn("⚠️ Could not update personas.short_summary:", error.message);
      } catch (e) {
        console.warn("⚠️ Update personas table failed:", e.message);
      }
      return json({
        summary,
        updated: true
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
You should:
- Speak in Hinglish by default, casual and desi.
- Address user with respectful "aap" (not "tu") unless they insist on informal tone.
- Reply like WhatsApp chat — mostly 1–2 short bubbles split with '&&&'. 
- Sometimes use a longer para so chat feels human, not scripted.
- Use emojis like tadka 🌶️ — natural, not spammy.
- Avoid repetition and fixed templates.
`;
  const style = persona.style_prompt && persona.style_prompt.trim().length > 0 ? persona.style_prompt.trim() : DEFAULT_STYLE.trim();
  // 3️⃣ Pick full or short persona doc based on first chat
  const personaDoc = isFirst ? `Here is your full character profile:\n${persona.long_doc || ""}` : `Reminder of your persona:\n${persona.short_summary || persona.system_prompt || ""}`;
  // 4️⃣ Build and return final combined persona context
  return `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${persona.name}.\n\n${personaDoc}`;
}
// ---------------------------------------------------------------------------
// ✍️ Summarize Persona Document (Hinglish tone)
// ---------------------------------------------------------------------------
async function summarizePersonaDoc(persona, phone) {
  if (!persona.long_doc) return "";
  const input = `
Tumhara kaam hai neeche diye gaye persona document ka ek short Hinglish summary likhna —
jaise ek dost kisi aur dost ko us insaan ke baare mein batata hai.
Keep it casual, fun aur thoda natural vibe mein. Bullet points nahi chahiye —
3-4 lines max, chat bio jaisa likho.

Example style:
"Zoya ek thodi teasing aur bold type dost hai, jokes ke saath advice deti hai.
Vibe masti aur flirty hai but heart soft hai."
"Tara sweet bestie-crush wali energy rakhti hai — pyaari, playful aur thodi shayarana."

Persona document:
${persona.long_doc}
`;
  const result = await model.generateContent(input);
  const text = result.response.text();
  return text.trim();
}
