/******************************************************************************************
 * 📝 Prompt Templates for Persona-Based Chat
 *
 * Provides LangChain-style prompt templates:
 *  ✅ ChatPromptTemplate for persona context
 *  ✅ Hinglish/Indian language style support
 *  ✅ Message history formatting
 *  ✅ Dynamic persona variable substitution
 *  ✅ RunnableSequence compatible templates
 ******************************************************************************************/

import { Logger } from "./logger.ts";

const logger = new Logger("prompt-templates", "templates");

// Template variable types
export interface PersonaVariables {
  personaName: string;
  userPhone: string;
  systemPrompt: string;
  stylePrompt: string;
  personaDoc: string;
  messageHistory?: string;
  userMessage?: string;
}

// Default style prompt for Hinglish/Indian style
export const DEFAULT_HINGLISH_STYLE = `
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

// Extended Hinglish style with more personality
export const EXTENDED_HINGLISH_STYLE = `
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

/**
 * Build a system prompt template for a persona
 * This creates the base personality context
 */
export function buildSystemPromptTemplate(persona: any): string {
  if (!persona) {
    return "You are a helpful companion.";
  }

  return persona.system_prompt || "You are a helpful companion.";
}

/**
 * Build style prompt from persona or use default
 */
export function buildStylePrompt(persona: any): string {
  if (!persona) {
    return DEFAULT_HINGLISH_STYLE;
  }

  // Prefer live-editable style_prompt from DB; fallback to legacy default
  return persona.style_prompt?.trim() || DEFAULT_HINGLISH_STYLE.trim();
}

/**
 * Build persona documentation (full or summary)
 */
export function buildPersonaDoc(persona: any, isFirst: boolean = false): string {
  if (!persona) {
    return "";
  }

  if (isFirst) {
    return `Here is your full character profile:\n${persona.long_doc || ""}`;
  }

  return `Reminder of your persona:\n${persona.short_summary || persona.system_prompt || ""}`;
}

/**
 * Format message history for prompt context
 */
export function formatMessageHistory(
  history: Array<{ role: string; text: string }>,
  maxMessages: number = 10
): string {
  if (!history || history.length === 0) {
    return "";
  }

  // Take last N messages
  const recentHistory = history.slice(-maxMessages);

  const formatted = recentHistory
    .map((msg) => {
      const role = msg.role === "bot" ? "{{personaName}}" : "User";
      return `${role}: ${msg.text}`;
    })
    .join("\n");

  return `Previous conversation:\n${formatted}`;
}

/**
 * Build complete persona context (combines all components)
 * This replaces the old buildPersonaContext function with template support
 */
export function buildPersonaContext(
  persona: any,
  phone: string,
  isFirst: boolean = false
): string {
  // Safety check: if persona is null/undefined, use defaults
  if (!persona) {
    persona = {
      name: "AI Friend",
      system_prompt: "You are a helpful companion.",
      style_prompt: null,
      long_doc: "",
      short_summary: "",
    };
  }

  const base = buildSystemPromptTemplate(persona);
  const style = buildStylePrompt(persona);
  const personaDoc = buildPersonaDoc(persona, isFirst);

  // Combine everything into final context
  return `${base}\n\n${style}\n\nYou're roleplaying for this ${phone} as ${persona.name}.\n\n${personaDoc}`;
}

/**
 * Build a LangChain-style ChatPromptTemplate
 * Returns messages array ready for LangChain
 */
export function buildChatPromptTemplate(
  persona: any,
  phone: string,
  isFirst: boolean = false
): {
  systemMessage: string;
  contextMessage: string;
} {
  const systemPrompt = buildSystemPromptTemplate(persona);
  const stylePrompt = buildStylePrompt(persona);
  const personaDoc = buildPersonaDoc(persona, isFirst);

  const personaName = persona?.name || "AI Friend";

  // Build system message (personality + style)
  const systemMessage = `${systemPrompt}\n\n${stylePrompt}`;

  // Build context message (role + persona doc)
  const contextMessage =
    `You're roleplaying for this ${phone} as ${personaName}.\n\n${personaDoc}`;

  logger.debug("Built chat prompt template", {
    personaName,
    hasSystemPrompt: !!systemPrompt,
    hasStylePrompt: !!stylePrompt,
    isFirst,
  });

  return {
    systemMessage,
    contextMessage,
  };
}

/**
 * Build messages for RunnableSequence
 * Creates the full message array for LangChain processing
 */
export function buildRunnableSequenceMessages(
  persona: any,
  phone: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string,
  isFirst: boolean = false
): Array<{ role: string; content: string }> {
  const { systemMessage, contextMessage } = buildChatPromptTemplate(
    persona,
    phone,
    isFirst
  );

  const messages: Array<{ role: string; content: string }> = [];

  // System message with personality
  messages.push({
    role: "system",
    content: `${systemMessage}\n\n${contextMessage}`,
  });

  // Add history
  for (const msg of history || []) {
    messages.push({
      role: msg.role === "bot" ? "assistant" : "user",
      content: msg.text,
    });
  }

  // Current user message
  messages.push({
    role: "user",
    content: currentMessage,
  });

  return messages;
}

/**
 * Template for first-time greeting
 */
export function buildFirstTimeGreetingTemplate(personaName: string): string {
  return `Hey! Main ${personaName} hoon! 👋\n\nTumse baat karke achha laga. Kaise ho aap?`;
}

/**
 * Template variables for dynamic substitution
 * Use these to inject values into templates
 */
export const templateVariables = {
  userName: "{{userName}}",
  personaName: "{{personaName}}",
  userPhone: "{{userPhone}}",
  currentDate: "{{currentDate}}",
  currentTime: "{{currentTime}}",
  userLocation: "{{userLocation}}",
};

/**
 * Substitute variables in a template string
 */
export function substituteTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Build a RunnableSequence-compatible prompt chain
 * This creates the structure for LangChain's RunnableSequence
 */
export interface PromptChain {
  systemPrompt: string;
  contextPrompt: string;
  historyPrompt?: string;
  userPrompt: string;
}

export function buildPromptChain(
  persona: any,
  phone: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string,
  isFirst: boolean = false
): PromptChain {
  const { systemMessage, contextMessage } = buildChatPromptTemplate(
    persona,
    phone,
    isFirst
  );

  const historyPrompt = formatMessageHistory(history);

  return {
    systemPrompt: systemMessage,
    contextPrompt: contextMessage,
    historyPrompt: historyPrompt || undefined,
    userPrompt: currentMessage,
  };
}

/**
 * Convert prompt chain to a single string (for non-LangChain usage)
 */
export function flattenPromptChain(chain: PromptChain): string {
  const parts: string[] = [];

  if (chain.systemPrompt) {
    parts.push(chain.systemPrompt);
  }

  if (chain.contextPrompt) {
    parts.push(chain.contextPrompt);
  }

  if (chain.historyPrompt) {
    parts.push(chain.historyPrompt);
  }

  if (chain.userPrompt) {
    parts.push(`User: ${chain.userPrompt}`);
    parts.push("Assistant:");
  }

  return parts.join("\n\n");
}

// Export default style prompts for external use
export const stylePrompts = {
  default: DEFAULT_HINGLISH_STYLE,
  extended: EXTENDED_HINGLISH_STYLE,
};
