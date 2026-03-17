// supabase/functions/chat-handler/utils/personaUtils.ts

/**
 * 🎭 Persona Utilities (Chat Handler)
 * 
 * This file re-exports from the shared promptTemplates utility
 * for backwards compatibility.
 * 
 * @deprecated Import from ../utils/promptTemplates.ts instead
 */

export {
  buildPersonaContext,
  buildChatPromptTemplate,
  buildPromptChain,
  buildRunnableSequenceMessages,
  formatMessageHistory,
  buildSystemPromptTemplate,
  buildStylePrompt,
  buildPersonaDoc,
  DEFAULT_HINGLISH_STYLE,
  EXTENDED_HINGLISH_STYLE,
  stylePrompts,
} from "../utils/promptTemplates.ts";

/**
 * Get persona context for a specific message (wrapper for backwards compatibility)
 * @deprecated Use buildPersonaContext from promptTemplates.ts
 */
export function getPersonaSystemInstruction(persona: any, phone: string): string {
  // Use the already imported buildPersonaContext
  return buildPersonaContext(persona, phone, false);
}
