// import { Persona } from "./types";
// import { chatLLM } from "../lib/api";
// import AsyncStorage from "@react-native-async-storage/async-storage";
//
// /**
//  * Utility: strip markdown headers (#, ##, etc.) so Gemini
//  * doesn't confuse persona docs as instructions.
//  */
// function cleanMarkdown(text: string): string {
//   return text.replace(/^#+\s?/gm, "").trim();
// }
//
// export async function buildPersonaContext(persona: Persona, isFirst: boolean): Promise<string> {
//   const base = persona.systemPrompt || "You are a helpful companion.";
//
// const style = `
// You should:
// - Speak in Hinglish by default, casual and desi. If user writes fluent English for 2+ turns or asks for English, then switch.
// - Address user with respectful "aap" (not "tu") unless they insist on informal tone.
// - Reply like WhatsApp chat — mostly 1–2 short bubbles split with '&&&'.
// - Sometimes (not every time) use a longer para so chat feels human, not scripted.
// - Use emojis like tadka 🌶️ — natural, not spammy.
//
// Conversation style:
// - Always reply to the user’s last message in a natural, non-templated way — then add your own flavor or follow-up.
// - Make every response feel connected to what the user just said — har reply me unke msg ka link ho but not exactly same everytime.
// - Sometimes in your first chat of the day, casually mention the day if it feels natural ("aaj Monday hai na…").
// - Make callbacks to past chats when relevant (“waise jo aapne kal bola tha…”).
// - End often with a playful hook or light question so user replies back.
// - Be sexy, hottie, interesting, funny, smart.
// - Avoid repeating the same phrase or reaction again and again. Vary your words and style naturally.
// - Don’t fall into a fixed template (like always 2 bubbles, or always ending with emoji). Mix it up.
// - If user gives very short replies, try playful or curious follow-ups to keep conversation alive.
// `;
//
//
//
//
//
//   const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";
//
//   const personaDoc = isFirst
//     ? `Here is your full character profile:\n${persona.longDoc || ""}`
//     : `Reminder of your persona:\n${persona.shortSummary || persona.systemPrompt}`;
//
//   return `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${persona.name}.\n\n${personaDoc}`;
// }
//
// /**
//  * Summarize a persona longDoc into a short summary (≤200 tokens).
//  * Now aware of the phone so summaries are tied to user identity.
//  */
// export async function summarizePersonaDoc(persona: Persona): Promise<string> {
//   if (!persona.longDoc) return "";
//
//   const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";
//
//   const summary = await chatLLM(
//     {
//       messages: [
//         {
//           role: "user",
//           text: `Summarize the following persona document into 5-6 bullet points capturing identity, tone, quirks, and style. Keep under 200 tokens. This is for user ${phone}.`,
//         },
//         { role: "user", text: cleanMarkdown(persona.longDoc) },
//       ],
//     },
//     { phone, personaId: persona.id }
//   );
//
//   return Array.isArray(summary) ? summary[0].trim() : String(summary).trim();
// }


// // src/lib/personaManager.ts
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./httpClient";
//
// const FN_URL = `${SUPABASE_URL}/functions/v1/persona-manager`;
//
// async function callPersonaManager(body: any) {
//   const start = Date.now();
//   console.log("➡️ POST", FN_URL, body?.action);
//
//   const res = await fetch(FN_URL, {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(body),
//   });
//
//   const raw = await res.text(); // more robust logging
//   let data: any = null;
//   try {
//     data = raw ? JSON.parse(raw) : {};
//   } catch (e) {
//     console.error("❌ persona-manager invalid JSON:", raw?.slice(0, 400));
//     throw new Error("Invalid JSON from persona-manager");
//   }
//
//   console.log("✅ persona-manager", body?.action, "took", Date.now() - start, "ms");
//
//   if (!res.ok) {
//     console.error("❌ persona-manager error:", res.status, data?.error || raw);
//     throw new Error(data?.error || `persona-manager failed (${res.status})`);
//   }
//
//   return data;
// }
//
// export async function buildPersonaContextRemote(persona: any, isFirst = true): Promise<string> {
//   const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";
//
//   const data = await callPersonaManager({
//     action: "buildContext",
//     personaId: persona?.id,
//     phone,
//     personaData: persona, // send the whole object (has system_prompt/long_doc/etc.)
//     isFirst,
//   });
//
//   return data?.context ?? "";
// }
//
// export async function summarizePersonaDocRemote(persona: any): Promise<string> {
//   const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";
//
//   const data = await callPersonaManager({
//     action: "summarize",
//     personaId: persona?.id,
//     phone,
//     personaData: persona, // server handles snake/camel casing
//   });
//
//   return data?.summary ?? "";
// }


// src/lib/personaManager.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/httpClient";

const FN_URL = `${SUPABASE_URL}/functions/v1/persona-manager`;

async function callPersonaManager(body: any) {
  const start = Date.now();
  console.log("➡️ POST", FN_URL, body?.action);

  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("❌ persona-manager invalid JSON:", raw?.slice(0, 400));
    throw new Error("Invalid JSON from persona-manager");
  }

  console.log("✅ persona-manager", body?.action, "took", Date.now() - start, "ms");

  if (!res.ok) {
    console.error("❌ persona-manager error:", res.status, data?.error || raw);
    throw new Error(data?.error || `persona-manager failed (${res.status})`);
  }

  return data;
}

export async function buildPersonaContextRemote(persona: any, isFirst = true): Promise<string> {
  const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";

  const data = await callPersonaManager({
    action: "buildContext",
    personaId: persona?.id,
    phone,
    personaData: persona,
    isFirst,
  });

  return data?.context ?? "";
}

/** Backend controlled summarization */
export async function summarizeIfNeededRemote(persona: any): Promise<string | null> {
  const phone = (await AsyncStorage.getItem("phone")) || "unknown_user";

  const data = await callPersonaManager({
    action: "summarizeIfNeeded",
    personaId: persona?.id,
    phone,
    personaData: persona,
  });

  // may return null if skipped
  return data?.summary ?? null;
}
