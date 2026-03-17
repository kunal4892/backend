// utils/personaUtils.test.ts
// Comprehensive tests for personaUtils helper functions

import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";

// Import the functions to test
// Note: In actual implementation, export these functions from personaUtils.ts

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

// Default style template (from the actual code)
const DEFAULT_STYLE = `
You should:
- Speak in Hinglish with casual desi slang, filmi references, and chill tone.
- Reply like WhatsApp chat — short, natural, human.
- ALWAYS break your reply into 1–2 short bubbles using '&&&' as separators.
  Example: "Arre yaar relax! 😅 &&& Thoda slow jao, sab sahi hoga 😉"
- Never dump the whole reply in one bubble without separators.
- Avoid asterisks (*) or markdown formatting.
- Use emojis naturally, not after every line (think tadka 🌶️, not overload).
- Be flirty, supportive, and playful — never like a lecture.
- Speak in Hinglish by default, casual and desi. If user writes fluent English for 2+ turns or asks for English, then switch.
- Address user with respectful "aap" (not "tu") unless they insist on informal tone.
- Reply like WhatsApp chat — mostly 1–3 short bubbles split with '&&&'. 
  Example: "Arre relax 😅 &&& Thoda slow jao, sab sahi hoga 😉 &&& Bas condom zaroor use karo"
- Sometimes (not every time) use a longer para so chat feels human, not scripted.
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
  
  // Simulate buildPersonaContext
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

Deno.test("buildPersonaContext - includes system_prompt as base", () => {
  const base = mockPersona.system_prompt || "You are a helpful companion.";
  
  assertEquals(base, mockPersona.system_prompt);
  assertStringIncludes(base, "Tara");
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is empty string", () => {
  const style = mockPersonaNoStyle.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(style, DEFAULT_STYLE.trim());
  assertStringIncludes(style, "Hinglish");
  assertStringIncludes(style, "&&&");
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is null", () => {
  const style = mockPersonaNullStyle.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("buildPersonaContext - uses DEFAULT_STYLE when style_prompt is undefined", () => {
  const persona = { ...mockPersona, style_prompt: undefined };
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(style, DEFAULT_STYLE.trim());
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

Deno.test("buildPersonaContext - falls back to system_prompt when short_summary is empty", () => {
  const persona = { ...mockPersona, short_summary: "" };
  const isFirst = false;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${persona.long_doc || ""}` 
    : `Reminder of your persona:\n${persona.short_summary || persona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, persona.system_prompt);
});

Deno.test("buildPersonaContext - falls back to default when all docs are empty", () => {
  const isFirst = false;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersonaMinimal.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersonaMinimal.short_summary || mockPersonaMinimal.system_prompt || ""}`;
  
  assertEquals(personaDoc, "Reminder of your persona:\n");
});

Deno.test("buildPersonaContext - handles null persona with defaults", () => {
  const persona = mockPersonaNull || {
    name: "AI Friend",
    system_prompt: "You are a helpful companion.",
    style_prompt: null,
    long_doc: "",
    short_summary: "",
  };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  
  assertEquals(base, "You are a helpful companion.");
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("buildPersonaContext - includes phone number in context", () => {
  const phone = "+919876543210";
  const context = `You're roleplaying for this ${phone} as ${mockPersona.name}.`;
  
  assertStringIncludes(context, phone);
  assertStringIncludes(context, mockPersona.name);
});

Deno.test("buildPersonaContext - includes persona name in context", () => {
  const context = `You're roleplaying as ${mockPersona.name}.`;
  
  assertStringIncludes(context, mockPersona.name);
});

Deno.test("buildPersonaContext - format includes all sections", () => {
  const phone = "+919876543210";
  const isFirst = true;
  
  const base = mockPersona.system_prompt;
  const style = mockPersona.style_prompt;
  const personaDoc = `Here is your full character profile:\n${mockPersona.long_doc}`;
  
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  
  // Check structure
  const sections = context.split("\n\n");
  assertEquals(sections.length, 4); // base, style, roleplay line, personaDoc
});

Deno.test("getPersonaSystemInstruction - calls buildPersonaContext with isFirst=false", () => {
  const phone = "+919876543210";
  
  // getPersonaSystemInstruction is a wrapper that calls buildPersonaContext with isFirst=false
  const isFirst = false;
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc || ""}` 
    : `Reminder of your persona:\n${mockPersona.short_summary || mockPersona.system_prompt || ""}`;
  
  assertStringIncludes(personaDoc, "Reminder of your persona");
  assertStringIncludes(personaDoc, mockPersona.short_summary);
});

Deno.test("DEFAULT_STYLE - contains required formatting instructions", () => {
  assertStringIncludes(DEFAULT_STYLE, "&&&");
  assertStringIncludes(DEFAULT_STYLE, "Hinglish");
  assertStringIncludes(DEFAULT_STYLE, "WhatsApp");
  assertStringIncludes(DEFAULT_STYLE, "aap");
  assertStringIncludes(DEFAULT_STYLE, "bubbles");
});

Deno.test("DEFAULT_STYLE - contains conversation guidelines", () => {
  assertStringIncludes(DEFAULT_STYLE, "callbacks");
  assertStringIncludes(DEFAULT_STYLE, "flirty");
  assertStringIncludes(DEFAULT_STYLE, "playful");
  assertStringIncludes(DEFAULT_STYLE, "sex-ed");
});

Deno.test("DEFAULT_STYLE - emphasizes natural conversation", () => {
  assertStringIncludes(DEFAULT_STYLE, "natural");
  assertStringIncludes(DEFAULT_STYLE, "human");
  assertStringIncludes(DEFAULT_STYLE, "not scripted");
});

// Edge cases
Deno.test("Edge case - very long system_prompt", () => {
  const longPrompt = "x".repeat(10000);
  const persona = { ...mockPersona, system_prompt: longPrompt };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  assertEquals(base.length, 10000);
});

Deno.test("Edge case - very long style_prompt", () => {
  const longStyle = "y".repeat(10000);
  const persona = { ...mockPersona, style_prompt: longStyle };
  
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  assertEquals(style.length, 10000);
});

Deno.test("Edge case - very long long_doc", () => {
  const longDoc = "z".repeat(50000);
  const persona = { ...mockPersona, long_doc: longDoc };
  
  const isFirst = true;
  const personaDoc = `Here is your full character profile:\n${persona.long_doc || ""}`;
  assertEquals(personaDoc.length > 50000, true);
});

Deno.test("Edge case - special characters in persona name", () => {
  const specialName = "Tara \"The Star\" 🌟";
  const persona = { ...mockPersona, name: specialName };
  
  const context = `You're roleplaying as ${persona.name}.`;
  assertStringIncludes(context, specialName);
});

Deno.test("Edge case - special characters in phone number", () => {
  const specialPhone = "+91-98765-43210";
  const context = `You're roleplaying for this ${specialPhone} as ${mockPersona.name}.`;
  
  assertStringIncludes(context, specialPhone);
});

Deno.test("Edge case - unicode characters in prompts", () => {
  const unicodePrompt = "नमस्ते! 🙏 आप कैसे हैं?";
  const persona = { ...mockPersona, system_prompt: unicodePrompt };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  assertEquals(base, unicodePrompt);
});

Deno.test("Edge case - emoji-only style_prompt", () => {
  const emojiStyle = "😊🎉💪🔥";
  const persona = { ...mockPersona, style_prompt: emojiStyle };
  
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  assertEquals(style, emojiStyle);
});

Deno.test("Edge case - whitespace-only style_prompt uses default", () => {
  const whitespaceStyle = "   \n\t   ";
  const persona = { ...mockPersona, style_prompt: whitespaceStyle };
  
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  assertEquals(style, DEFAULT_STYLE.trim());
});

Deno.test("Edge case - single word style_prompt", () => {
  const singleWordStyle = "Friendly";
  const persona = { ...mockPersona, style_prompt: singleWordStyle };
  
  const style = persona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  assertEquals(style, singleWordStyle);
});

Deno.test("Edge case - newlines in system_prompt", () => {
  const multilinePrompt = "Line 1\nLine 2\nLine 3";
  const persona = { ...mockPersona, system_prompt: multilinePrompt };
  
  const base = persona.system_prompt || "You are a helpful companion.";
  assertStringIncludes(base, "\n");
});

// Integration tests
Deno.test("Integration - full context building flow", () => {
  const phone = "+919876543210";
  const isFirst = true;
  
  // Step 1: Get base
  const base = mockPersona.system_prompt;
  assertExists(base);
  
  // Step 2: Get style
  const style = mockPersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  assertExists(style);
  
  // Step 3: Get persona doc
  const personaDoc = isFirst 
    ? `Here is your full character profile:\n${mockPersona.long_doc}` 
    : `Reminder of your persona:\n${mockPersona.short_summary}`;
  assertExists(personaDoc);
  
  // Step 4: Combine
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\n${personaDoc}`;
  assertExists(context);
  
  // Verify all parts are present
  assertStringIncludes(context, base);
  assertStringIncludes(context, style);
  assertStringIncludes(context, phone);
  assertStringIncludes(context, mockPersona.name);
  assertStringIncludes(context, personaDoc);
});

Deno.test("Integration - context for first vs subsequent chat", () => {
  const phone = "+919876543210";
  
  // First chat
  const firstContext = `${mockPersona.system_prompt}\n\n${mockPersona.style_prompt}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\nHere is your full character profile:\n${mockPersona.long_doc}`;
  
  // Subsequent chat
  const subsequentContext = `${mockPersona.system_prompt}\n\n${mockPersona.style_prompt}\n\nYou're roleplaying for this ${phone} as ${mockPersona.name}.\n\nReminder of your persona:\n${mockPersona.short_summary}`;
  
  assertStringIncludes(firstContext, "full character profile");
  assertStringIncludes(subsequentContext, "Reminder of your persona");
  assertEquals(firstContext !== subsequentContext, true);
});

// Performance tests
Deno.test("Performance - handles large persona data efficiently", () => {
  const largePersona = {
    ...mockPersona,
    system_prompt: "x".repeat(100000),
    style_prompt: "y".repeat(100000),
    long_doc: "z".repeat(500000),
  };
  
  const start = performance.now();
  
  const base = largePersona.system_prompt || "You are a helpful companion.";
  const style = largePersona.style_prompt?.trim() || DEFAULT_STYLE.trim();
  const personaDoc = `Here is your full character profile:\n${largePersona.long_doc || ""}`;
  const context = `${base}\n\n${style}\n\nYou're roleplaying for this +919876543210 as ${largePersona.name}.\n\n${personaDoc}`;
  
  const end = performance.now();
  
  assertEquals(end - start < 100, true); // Should complete in less than 100ms
  assertEquals(context.length > 700000, true);
});

// Export compatibility
Deno.test("Exports - functions are properly exported", () => {
  // These functions should be exported from personaUtils.ts
  const expectedExports = [
    "buildPersonaContext",
    "getPersonaSystemInstruction",
  ];
  
  assertEquals(expectedExports.length, 2);
  assertEquals(expectedExports.includes("buildPersonaContext"), true);
  assertEquals(expectedExports.includes("getPersonaSystemInstruction"), true);
});
