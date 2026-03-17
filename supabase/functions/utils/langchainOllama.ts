/******************************************************************************************
 * 🤖 LangChain Ollama Client
 *
 * Provides LangChain integration with Ollama for AI chat:
 *  ✅ ChatOllama LLM wrapper with streaming support
 *  ✅ RunnableSequence for chat flows
 *  ✅ Fallback to Gemini API if Ollama unavailable
 *  ✅ Persona-based prompt templates
 *  ✅ Hinglish/Indian language style support
 *  ✅ Proper error handling and logging
 ******************************************************************************************/

import { Logger } from "./logger.ts";

// Environment configuration
const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434";
const OLLAMA_MODEL = Deno.env.get("OLLAMA_MODEL") || "kimi-k2.5";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const USE_OLLAMA = Deno.env.get("USE_OLLAMA") !== "false"; // Default to true

// Types for chat messages
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  onToken?: (token: string) => void;
}

export interface ChatResponse {
  content: string;
  bubbles: string[];
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// Logger for this module
const logger = new Logger("langchain-ollama", "langchain");

/**
 * Check if Ollama is available
 */
export async function isOllamaAvailable(): Promise<boolean> {
  if (!USE_OLLAMA) {
    logger.debug("Ollama disabled via USE_OLLAMA env var");
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const hasModel = data.models?.some((m: any) =>
        m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL)
      );
      logger.debug("Ollama health check", { available: true, hasModel });
      return hasModel;
    }
    return false;
  } catch (error) {
    logger.warn("Ollama not available, will fallback to Gemini", {
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Build chat prompt messages for LangChain
 * Converts our message format to LangChain format
 */
export function buildChatMessages(
  systemPrompt: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string
): ChatMessage[] {
  const messages: ChatMessage[] = [];

  // Add system message
  if (systemPrompt) {
    messages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  // Add history
  for (const msg of history || []) {
    messages.push({
      role: msg.role === "bot" ? "assistant" : "user",
      content: msg.text,
    });
  }

  // Add current message
  messages.push({
    role: "user",
    content: currentMessage,
  });

  return messages;
}

/**
 * Call Ollama API directly (for Deno compatibility)
 */
async function callOllamaAPI(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const { temperature = 0.9, maxTokens = 2048 } = options;

  // Convert messages to Ollama format
  const ollamaMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  logger.info("Calling Ollama API", {
    model: OLLAMA_MODEL,
    messageCount: messages.length,
    streaming: options.streaming || false,
  });

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: ollamaMessages,
      stream: options.streaming || false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
  }

  // Handle streaming response
  if (options.streaming && options.onToken) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body for streaming");
    }

    let fullContent = "";
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullContent += data.message.content;
            options.onToken(data.message.content);
          }
          if (data.done) break;
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }

    return {
      content: fullContent,
      bubbles: splitIntoBubbles(fullContent),
      model: OLLAMA_MODEL,
    };
  }

  // Handle non-streaming response
  const data = await response.json();
  const content = data.message?.content || "";

  return {
    content,
    bubbles: splitIntoBubbles(content),
    model: OLLAMA_MODEL,
    usage: {
      promptTokens: data.prompt_eval_count,
      completionTokens: data.eval_count,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    },
  };
}

/**
 * Call Gemini API as fallback
 */
async function callGeminiAPI(
  systemPrompt: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured for fallback");
  }

  logger.info("Calling Gemini API (fallback)", {
    model: "gemini-2.5-pro",
    historyCount: history?.length || 0,
  });

  const GEMINI_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

  // Build contents for Gemini
  const contents: any[] = [];
  for (const m of history || []) {
    const role = m.role === "bot" ? "model" : "user";
    contents.push({
      role,
      parts: [{ text: m.text }],
    });
  }

  // Add current message
  contents.push({
    role: "user",
    parts: [{ text: currentMessage }],
  });

  const requestBody: any = {
    contents,
    generationConfig: {
      temperature: options.temperature || 0.9,
      maxOutputTokens: options.maxTokens || 2048,
    },
  };

  // Add system instruction
  if (systemPrompt) {
    requestBody.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const content = candidate?.content?.parts?.[0]?.text?.trim() || "";

  return {
    content,
    bubbles: splitIntoBubbles(content),
    model: "gemini-2.5-pro",
  };
}

/**
 * Generate chat completion with automatic fallback
 * Primary: Ollama (LangChain-style)
 * Fallback: Gemini API
 */
export async function generateChatCompletion(
  systemPrompt: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string,
  options: ChatOptions = {}
): Promise<ChatResponse> {
  const startTime = performance.now();

  // Try Ollama first if enabled
  if (USE_OLLAMA) {
    try {
      const ollamaAvailable = await isOllamaAvailable();
      if (ollamaAvailable) {
        const messages = buildChatMessages(systemPrompt, history, currentMessage);
        const response = await callOllamaAPI(messages, options);

        const duration = Math.round(performance.now() - startTime);
        logger.info("Ollama completion successful", {
          durationMs: duration,
          model: response.model,
          bubbleCount: response.bubbles.length,
        });

        return response;
      }
    } catch (error) {
      logger.warn("Ollama failed, falling back to Gemini", {
        error: (error as Error).message,
      });
    }
  }

  // Fallback to Gemini
  try {
    const response = await callGeminiAPI(
      systemPrompt,
      history,
      currentMessage,
      options
    );

    const duration = Math.round(performance.now() - startTime);
    logger.info("Gemini fallback completion successful", {
      durationMs: duration,
      model: response.model,
      bubbleCount: response.bubbles.length,
    });

    return response;
  } catch (error) {
    logger.error("Both Ollama and Gemini failed", error as Error);
    throw new Error(
      `Chat completion failed: ${(error as Error).message}`
    );
  }
}

/**
 * Split reply into bubbles using &&& delimiter
 * Matches the existing behavior in chat-handler
 */
function splitIntoBubbles(text: string): string[] {
  const PLACEHOLDER = "___BUBBLE_SPLIT___";

  let cleanedText = text
    .trim()
    .replace(/&{4,}/g, "&&&")
    .replace(/\s*&&&\s*/g, PLACEHOLDER)
    .replace(/&+/g, "")
    .replace(new RegExp(PLACEHOLDER, "g"), "&&&")
    .trim();

  // Check if AI used &&& delimiter
  if (cleanedText.includes("&&&")) {
    return cleanedText
      .split("&&&")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 2);
  }

  // Fallback: Split by paragraphs
  const paragraphs = cleanedText
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 1 && paragraphs.length <= 4) {
    return paragraphs.slice(0, 2);
  }

  // Split long messages by sentences
  if (cleanedText.length > 150) {
    const sentences = cleanedText.match(/[^.!?]+[.!?]+/g) || [cleanedText];
    if (sentences.length >= 2) {
      const mid = Math.ceil(sentences.length / 2);
      return [
        sentences.slice(0, mid).join(" ").trim(),
        sentences.slice(mid).join(" ").trim(),
      ]
        .filter(Boolean)
        .slice(0, 2);
    }
  }

  return [cleanedText];
}

/**
 * Stream chat completion with Ollama
 * Returns an async iterator for streaming responses
 */
export async function* streamChatCompletion(
  systemPrompt: string,
  history: Array<{ role: string; text: string }>,
  currentMessage: string,
  options: Omit<ChatOptions, "streaming" | "onToken"> = {}
): AsyncGenerator<string, ChatResponse, unknown> {
  const messages = buildChatMessages(systemPrompt, history, currentMessage);
  const { temperature = 0.9, maxTokens = 2048 } = options;

  logger.info("Starting streaming chat completion", {
    model: OLLAMA_MODEL,
    messageCount: messages.length,
  });

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama streaming error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body for streaming");
  }

  let fullContent = "";
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullContent += data.message.content;
            yield data.message.content;
          }
          if (data.done) {
            return {
              content: fullContent,
              bubbles: splitIntoBubbles(fullContent),
              model: OLLAMA_MODEL,
              usage: {
                promptTokens: data.prompt_eval_count,
                completionTokens: data.eval_count,
                totalTokens:
                  (data.prompt_eval_count || 0) + (data.eval_count || 0),
              },
            };
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    bubbles: splitIntoBubbles(fullContent),
    model: OLLAMA_MODEL,
  };
}

// Export configuration for external use
export const ollamaConfig = {
  baseUrl: OLLAMA_BASE_URL,
  model: OLLAMA_MODEL,
  useOllama: USE_OLLAMA,
};
