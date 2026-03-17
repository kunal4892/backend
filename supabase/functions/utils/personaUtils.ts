// supabase/functions/utils/personaUtils.ts

/**
 * 🎭 Persona Utilities (Shared)
 * 
 * This file re-exports from promptTemplates.ts for backwards compatibility.
 * All persona-related functionality has been moved to promptTemplates.ts
 * with LangChain-compatible templates.
 * 
 * @deprecated Import from ./promptTemplates.ts instead
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
  type PersonaVariables,
  type PromptChain,
} from "./promptTemplates.ts";

/**
 * Get persona context for a specific message (wrapper for backwards compatibility)
 * @deprecated Use buildPersonaContext from promptTemplates.ts
 */
export function getPersonaSystemInstruction(persona: any, phone: string): string {
  // Use the already imported buildPersonaContext
  return buildPersonaContext(persona, phone, false);
}
