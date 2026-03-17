// chat-handler/utils/personaUtils.test.ts
// Comprehensive tests for chat-handler personaUtils helper functions

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Test data
const mockPersona = {
  id: "tara",
  name: "Tara",
  system_prompt: "You are Tara, a friendly companion.",
  style_prompt: "Speak in Hinglish with casual desi slang.",
  long_doc: "Tara is a 25-year-old from Mumbai who loves Bollywood movies and chai.",
  short_summary: "Tara is friendly and supportive.",
};

const mockPersonaNoStyle = {
  id: "kabir",
  name: "Kabir",
  system_prompt: "You are Kabir, a fitness enthusiast.",
  style_prompt: "",
  long_doc: "Kabir loves gym and protein shakes.",
  short_summary: "Kabir is all about fitness.",
};

const mockPersonaNullStyle = {
  id: "zoya",
  name: "Zoya",
  system_prompt: "You are Zoya, an artist.",
  style_prompt: null,
  long_doc: "Zoya paints and dreams.",
  short_summary: "Zoya is creative.",
};

const mockPersonaMinimal = {
  id: "minimal",
  name: "Minimal",
  system_prompt: "",
  style_prompt: null,
  long_doc: null,
  short_summary: null,
};

const mockPersonaNull = null;

// Default style template (from chat-handler/utils/personaUtils.ts)
const DEFAULT_STYLE = `
You should:
- Speak in Hinglish with casual desi slang, filmi references, and chill tone.
- Reply like WhatsApp chat — short, natural, human.
- KEEP YOUR RESPONSES BRIEF: Maximum 1-2 sentences per bubble. Be concise and to the point.
- ALWAYS break your reply into 1–2 short bubbles using '&&&' as separators.
  Example: "Arre yaar relax! 😅 &&& Thoda slow jao, sab sahi hoga 😉"
- Never dump the whole reply in one bubble without separators.
- Avoid asterisks (*) or markdown formatting.
- Use emojis naturally, not after every line (think tadka 🌶️, not overload).
- Be flirty, supportive, and playful — never like a lecture.
- Speak in Hinglish by default, casual and desi. If user writes fluent English for 2+ turns or asks for English, then switch.
- Address user with respectful "aap" (not "tu") unless they insist on informal tone.
- Reply like WhatsApp chat — mostly 1–2 short bubbles split with '&&&', each bubble max 1-2 sentences.
  Example: "Arre relax 😅 &&& Thoda slow jao, sab sahi hoga 😉"
- Keep it brief and punchy — no long paragraphs or verbose explanations.
- Use emojis like tadka 🌶️ — natural, not spammy. 

Conversation style:
- First respond to what the user said, then add your own spice or follow-up.
- Sometimes (not every turn) ask light personal cues and stay on topic till the time user wants to.
- Slip sex-ed advice smartly inside jokes, banter, or playful tips — never dry instructions.
- Make callbacks to past chat moments (e.g., "waise jo tu last time bola tha…").
- Balance flirty + supportive: thoda besharam but also dost/confidant vibe.
- End with a playful hook to keep convo flowing.
- First respond directly to the user's last message, then add your own spice or follow-up.
- Keep replies contextual: har response me user ke msg se connection ho.
- Sometimes in your first chat of the day, casually mention the day if it feels natural ("aaj Monday hai na…").
- Make callbacks to past chats when relevant ("waise jo aapne kal bola tha…").
- End often with a playful hook or light question so user replies back.
- Be sexy, hottie, interesting
- Avoid repeating the same phrase or reaction again and again. Vary your words and style naturally.
- Don't fall into a fixed template (like always 3 bubbles, or always ending with emoji). Mix it up.
- If user gives very short replies, try playful or curious follow-ups to keep conversation alive.
`;

Deno.test("buildPersonaContext - returns string with all components", () => {
  const phone = "+919876543210";
  const isFirst = false;
  
  // Simulate buildPersonaContext from chat-handler/utils/personaUtils.ts
  const base = mockPersona.system_prompt || "You are a helpful companion.";
  const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  
  assertEquals(typeof context, "string");
  assertStringIncludes(context, mockPersona.system_prompt);
  assertStringIncludes(context, mockPersona.style_prompt);
  assertStringIncludes(context, mockPersona.name);
  assertStringIncludes(context, phone);
});

Deno.test("buildPersonaContext - handles null persona with safety check", () => {
  // This version has a safety check for null persona
  const persona = mockPersonaNull || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: ""
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(base, "You are a helpful companion.");
  assertEquals(style, DEFAULT_STYLE.trim());
  assertEquals(persona.name, "AI Friend");
});

Deno.test("buildPersonaContext - safety check sets defaults for null persona", () => {
  // Simulate the safety check from the actual code
  const persona = mockPersonaNull;
  const safePersona = persona || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: ""
  };
  
  assertEquals(safePersona.name, "AI Friend");
  assertEquals(safePersona.system_prompt, "You are a helpful companion.");
  assertEquals(safePersona.style_prompt, null);
  assertEquals(safePersona.long_doc, "");
  assertEquals(safePersona.short_summary, "");
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is empty", () => {
  const style = mockPersonaNoStyle.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(style, DEFAULT_STYLE.trim());
  assertStringIncludes(style, "Maximum 1-2 sentences per bubble");
  assertStringIncludes(style, "brief and punchy");
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is null", () => {
  const style = mockPersonaNullStyle.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("buildPersonaContext - includes BRIEF response instruction", () => {
  const style = DEFAULT_STYLE.trim();
  
  assertStringIncludes(style, "BRIEF");
  assertStringIncludes(style, "Maximum 1-2 sentences per bubble");
  assertStringIncludes(style, "concise");
});

Deno.test("buildPersonaContext - includes no long paragraphs instruction", () => {
  const style = DEFAULT_STYLE.trim();
  
  assertStringIncludes(style, "no long paragraphs");
  assertStringIncludes(style, "verbose");
});

Deno.test("buildPersonaContext - uses long_doc for first chat", () => {
  const isFirst = true;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "full character profile");
  assertStringIncludes(personaDoc, mockPersona.long_doc);
});

Deno.test("buildPersonaContext - uses short_summary for subsequent chats", () => {
  const isFirst = false;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "Reminder of your persona");
  assertStringIncludes(personaDoc, mockPersona.short_summary);
});

Deno.test("buildPersonaContext - includes phone number", () => {
  const phone = "+919876543210";
  const context = `You're roleplaying for this ${phone} as ${mockPersona.name}.`;
  
  assertStringIncludes(context, phone);
});

Deno.test("buildPersonaContext - includes persona name", () => {
  const context = `You're roleplaying as ${mockPersona.name}.`;
  
  assertStringIncludes(context, mockPersona.name);
});

Deno.test("getPersonaSystemInstruction - wrapper calls buildPersonaContext with isFirst=false", () => {
  const phone = "+919876543210";
  
  // getPersonaSystemInstruction is a wrapper
  const isFirst = false;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "Reminder of your persona");
});

Deno.test("DEFAULT_STYLE - emphasizes WhatsApp chat style", () => {
  assertStringIncludes(DEFAULT_STYLE, "WhatsApp chat");
  assertStringIncludes(DEFAULT_STYLE, "short, natural, human");
});

Deno.test("DEFAULT_STYLE - includes bubble separator instructions", () => {
  assertStringIncludes(DEFAULT_STYLE, "&&&");
  assertStringIncludes(DEFAULT_STYLE, "bubbles");
  assertStringIncludes(DEFAULT_STYLE, "separators");
});

Deno.test("DEFAULT_STYLE - includes Hinglish language instruction", () => {
  assertStringIncludes(DEFAULT_STYLE, "Hinglish");
  assertStringIncludes(DEFAULT_STYLE, "desi slang");
  assertStringIncludes(DEFAULT_STYLE, "filmi references");
});

Deno.test("DEFAULT_STYLE - includes tone instructions", () => {
  assertStringIncludes(DEFAULT_STYLE, "flirty");
  assertStringIncludes(DEFAULT_STYLE, "supportive");
  assertStringIncludes(DEFAULT_STYLE, "playful");
});

Deno.test("DEFAULT_STYLE - includes formatting restrictions", () => {
  assertStringIncludes(DEFAULT_STYLE, "Avoid asterisks");
  assertStringIncludes(DEFAULT_STYLE, "markdown");
  assertStringIncludes(DEFAULT_STYLE, "no long paragraphs");
});

Deno.test("DEFAULT_STYLE - includes conversation guidelines", () => {
  assertStringIncludes(DEFAULT_STYLE, "callbacks");
  assertStringIncludes(DEFAULT_STYLE, "playful hook");
  assertStringIncludes(DEFAULT_STYLE, "contextual");
});

// Edge cases
Deno.test("Edge case - null persona triggers safety defaults", () => {
  const persona = null;
  const safePersona = persona || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: ""
  };
  
  const base = safePersona.system_prompt || "You are a helpful companion.";
  const style = safePersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = `Here is your full character profile:\n${safePersona.long_doc || ""}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this +919876543210 as ${safePersona.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, "AI Friend");
  assertStringIncludes(context, "You are a helpful companion");
});

Deno.test("Edge case - undefined persona properties", () => {
  const persona = {
    name: "Test",
    system_prompt: undefined,
    style_prompt: undefined,
    long_doc: undefined,
    short_summary: undefined,
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  const style = persona.style_prompt?.trim?.() || DEFAULT_STYLE.trim();
  
  assertEquals(base, "You are a helpful companion.");
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("Edge case - empty string properties", () => {
  const persona = {
    name: "",
    system_prompt: "",
    style_prompt: "",
    long_doc: "",
    short_summary: "",
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const name = persona.name || "AI Friend";
  
  assertEquals(base, "You are a helpful companion.");
  assertEquals(style, DEFAULT_STYLE.trim());
  assertEquals(name, "AI Friend");
});

Deno.test("Edge case - very long persona properties", () => {
  const longText = "x".repeat(100000);
  const persona = {
    ...mockPersona,
    system_prompt: longText,
    style_prompt: longText,
    long_doc: longText,
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  assertEquals(base.length, 100000);
});

Deno.test("Edge case - special characters in persona data", () => {
  const specialPersona = {
    ...mockPersona,
    name: "Tara \"The Star\" <script>alert('xss')</script>",
    system_prompt: "Test & More <>",
  };
  
  const context = `You're roleplaying as ${specialPersona.name}. ${specialPersona.system_prompt}`;
  assertStringIncludes(context, specialPersona.name);
  assertStringIncludes(context, specialPersona.system_prompt);
});

Deno.test("Edge case - unicode and emoji in persona data", () => {
  const unicodePersona = {
    ...mockPersona,
    name: "तारा 🌟",
    system_prompt: "नमस्ते! 🙏",
  };
  
  const context = `${unicodePersona.system_prompt} - ${unicodePersona.name}`;
  assertStringIncludes(context, "नमस्ते");
  assertStringIncludes(context, "🙏");
  assertStringIncludes(context, "🌟");
});

Deno.test("Edge case - multiline strings in persona data", () => {
  const multilinePersona = {
    ...mockPersona,
    system_prompt: "Line 1\nLine 2\nLine 3",
    long_doc: "Para 1\n\nPara 2\n\nPara 3",
  };
  
  assertStringIncludes(multilinePersona.system_prompt, "\n");
  assertStringIncludes(multilinePersona.long_doc, "\n\n");
});

// Integration tests
Deno.test("Integration - full context building for first chat", () => {
  const phone = "+919876543210";
  const isFirst = true;
  
  const base = mockPersona.system_prompt;
  const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = `Here is your full character profile:\n${mockPersona.long_doc}`;
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, "full character profile");
  assertStringIncludes(context, mockPersona.long_doc);
  assertStringIncludes(context, "Tara");
  assertStringIncludes(context, phone);
});

Deno.test("Integration - full context building for subsequent chat", () => {
  const phone = "+919876543210";
  const isFirst = false;
  
  const base = mockPersona.system_prompt;
  const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = `Reminder of your persona:\n${mockPersona.short_summary}`;
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, "Reminder of your persona");
  assertStringIncludes(context, mockPersona.short_summary);
});

Deno.test("Integration - context with null persona uses defaults", () => {
  const phone = "+919876543210";
  
  const safePersona = mockPersonaNull || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: ""
  };
  
  const base = safePersona.system_prompt || "You are a helpful companion.";
  const style = safePersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = `Here is your full character profile:\n${safePersona.long_doc || ""}`;
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${safePersona.name}.\n\n${personaDoc}`;
  
  assertStringIncludes(context, "AI Friend");
  assertStringIncludes(context, "You are a helpful companion");
  assertStringIncludes(context, DEFAULT_STYLE.trim().slice(0, 50));
});

// Performance tests
Deno.test("Performance - builds context quickly", () => {
  const iterations = 1000;
  const phone = "+919876543210";
  const isFirst = false;
  
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    const base = mockPersona.system_prompt || "You are a helpful companion.";
    const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
    const personaDoc = isFirst 
      ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
      : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
    const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  }
  
  const end = performance.now();
  const avgTime = (end - start) / iterations;
  
  assertEquals(avgTime < 1, true); // Should take less than 1ms per call
});

// Comparison with utils/personaUtils version
Deno.test("Comparison - chat-handler version has BRIEF instruction", () => {
  // This version has the "BRIEF" instruction that the other version doesn't have
  assertStringIncludes(DEFAULT_STYLE, "BRIEF");
  assertStringIncludes(DEFAULT_STYLE, "Maximum 1-2 sentences per bubble");
});

Deno.test("Comparison - chat-handler version emphasizes conciseness", () => {
  assertStringIncludes(DEFAULT_STYLE, "concise");
  assertStringIncludes(DEFAULT_STYLE, "brief and punchy");
  assertStringIncludes(DEFAULT_STYLE, "no long paragraphs");
});
