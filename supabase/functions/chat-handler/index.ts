// supabase/functions/chat-handler/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";
import { buildPersonaContext } from "../utils/promptTemplates.ts";
import {
  generateChatCompletion,
  isOllamaAvailable,
  ollamaConfig,
} from "../utils/langchainOllama.ts";
import { Logger } from "../utils/logger.ts";
import { rateLimiters } from "../utils/rateLimiter.ts";
import { validators, validateMessage, ValidationErrorCode } from "../utils/validator.ts";
import {
  createLangfuseClient,
  withTracing,
  withGenerationTracing,
  hashPhone
} from "../utils/langfuse.ts";

// ✅ Supabase setup
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize logger for startup
const startupLogger = new Logger("startup", "startup");

startupLogger.info("=== chat-handler: Environment check ===", {
  supabase_url_exists: !!supabaseUrl,
  service_role_key_exists: !!supabaseKey,
  jwt_secret_exists: !!JWT_SECRET,
  ollama_base_url: ollamaConfig.baseUrl,
  ollama_model: ollamaConfig.model,
  use_ollama: ollamaConfig.useOllama,
});

if (!supabaseUrl || !supabaseKey || !JWT_SECRET) {
  startupLogger.error("Missing required environment variables");
  throw new Error("Missing required environment variables");
}

// Check Ollama availability on startup (non-blocking)
isOllamaAvailable().then((available) => {
  startupLogger.info("Ollama availability check", { available });
});

// Friendly error messages
const FRIENDLY_ERROR_MESSAGES = [
  "Aapke request ko process karne mein kuch technical difficulty aayi hai. Thoda wait karo, phir try karo?",
  "We regret to inform you ki system thoda busy hai. Ek baar phir se try karo?",
  "Aapka request successfully process nahi ho paya. Thoda wait karo, phir try karo?"
];

function getFriendlyErrorMessage(): string {
  return FRIENDLY_ERROR_MESSAGES[Math.floor(Math.random() * FRIENDLY_ERROR_MESSAGES.length)];
}

/* -------------------------------------------------------------------------- */
/*                                Main Handler                                */
/* -------------------------------------------------------------------------- */
serve(async (req) => {
  // Create request-scoped logger with trace IDs
  const logger = Logger.fromRequest(req);
  const { requestId, correlationId } = logger.getTraceIds();

  // Initialize Langfuse client for this request
  const langfuse = createLangfuseClient(logger);

  logger.info("=== chat-handler: Request received ===", {
    method: req.method,
    url: req.url,
    user_agent: req.headers.get("user-agent"),
    langfuse_enabled: langfuse.isEnabled(),
  });

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    const headers = cors();
    logger.addTraceHeaders(headers);
    return new Response(null, { status: 204, headers });
  }

  try {
    const t0 = performance.now();

    // Start Langfuse trace
    const traceId = await langfuse.startTrace({
      name: "chat-handler",
      metadata: {
        endpoint: "/chat-handler",
        method: req.method,
        user_agent: req.headers.get("user-agent"),
      },
    });

    // --- 1️⃣ Rate Limiting Check ---
    const rateLimitCheck = rateLimiters.chat(req, logger);

    if (!rateLimitCheck.allowed) {
      logger.warn("Rate limit exceeded", {
        limit: rateLimitCheck.result.limit,
        retry_after: rateLimitCheck.result.retryAfter,
      });

      await langfuse.updateTrace({
        error: "RATE_LIMIT_EXCEEDED",
        rate_limit_hit: true,
      });

      const headers = cors();
      if (rateLimitCheck.headers) {
        Object.entries(rateLimitCheck.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }
      logger.addTraceHeaders(headers);

      return json({
        replies: ["Bahut zyada messages bhej rahe ho! Thoda ruko, phir try karo. 😅"],
        messages: [],
        error: "RATE_LIMIT_EXCEEDED",
      }, 429, headers);
    }

    // --- 2️⃣ Fast token verification ---
    const authHeader = req.headers.get("Authorization");

    let authResult;
    try {
      authResult = await verifyAndRefreshToken(authHeader, req);
    } catch (authError: any) {
      logger.warn("Authentication failed", { error: authError.message });

      await langfuse.recordError(authError, { stage: "authentication" });
      await langfuse.updateTrace({ error: "AUTH_FAILED" });

      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({
        replies: [getFriendlyErrorMessage()],
        messages: [],
        error: "AUTH_FAILED",
      }, 200, headers);
    }

    const tAuth = performance.now();
    logger.info("Authentication completed", {
      duration_ms: Math.round(tAuth - t0),
      was_refreshed: authResult.wasRefreshed,
    });

    const phone = authResult.phone;

    // Update trace with user ID (hashed)
    if (traceId) {
      await langfuse.updateTrace({
        userId: hashPhone(phone),
        phone_hash: hashPhone(phone),
        auth_duration_ms: Math.round(tAuth - t0),
      });
    }

    // --- 3️⃣ Parse and validate body ---
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      logger.warn("Failed to parse request body", { error: (parseError as Error).message });

      await langfuse.recordError(parseError as Error, { stage: "parse_body" });
      await langfuse.updateTrace({ error: "INVALID_JSON" });

      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({
        replies: [getFriendlyErrorMessage()],
        messages: [],
        error: "INVALID_JSON",
      }, 200, headers);
    }

    // Validate request schema
    const validationResult = validators.chatRequest(body);

    if (!validationResult.valid) {
      const validationErrors = validationResult.errors.map(e => ({
        field: e.field,
        code: e.code,
      }));

      logger.warn("Request validation failed", {
        errors: validationErrors,
        phone: phone.slice(-4), // Log only last 4 digits for privacy
      });

      await langfuse.updateTrace({
        error: "VALIDATION_FAILED",
        validation_errors: validationErrors,
      });

      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({
        replies: [getFriendlyErrorMessage()],
        messages: [],
        error: "VALIDATION_FAILED",
        validation_errors: validationErrors,
      }, 200, headers);
    }

    const { personaId, text } = validationResult.data!;

    // Validate and sanitize message content
    const messageValidation = validateMessage(text, {
      maxLength: 2000,
      minLength: 1,
    });

    if (!messageValidation.valid) {
      const securityErrors = messageValidation.errors.filter(e =>
        e.code === ValidationErrorCode.CONTAINS_XSS ||
        e.code === ValidationErrorCode.CONTAINS_INJECTION
      );

      if (securityErrors.length > 0) {
        logger.error("Security violation detected", undefined, {
          errors: securityErrors.map(e => e.code),
          phone: phone.slice(-4),
        });

        await langfuse.updateTrace({
          error: "SECURITY_VIOLATION",
          security_errors: securityErrors.map(e => e.code),
        });

        const headers = cors();
        logger.addTraceHeaders(headers);
        return json({
          replies: ["Aapke message mein kuch invalid characters hain. Please saaf message bhejo. 🙏"],
          messages: [],
          error: "SECURITY_VIOLATION",
        }, 200, headers);
      }

      // Other validation errors (too long, etc.)
      logger.warn("Message validation failed", {
        errors: messageValidation.errors.map(e => e.code),
      });

      await langfuse.updateTrace({
        error: "INVALID_MESSAGE",
        validation_errors: messageValidation.errors.map(e => e.code),
      });

      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({
        replies: [getFriendlyErrorMessage()],
        messages: [],
        error: "INVALID_MESSAGE",
      }, 200, headers);
    }

    const sanitizedText = messageValidation.data!;

    logger.info("Request validated", {
      persona_id: personaId,
      message_length: sanitizedText.length,
    });

    /* ---------------------------------------------------------------------- */
    /*             Step 1: Get thread + persona in parallel                   */
    /* ---------------------------------------------------------------------- */
    const [{ thread }, { persona }] = await withTracing(
      langfuse,
      "get_thread_and_persona",
      async () => {
        const [threadResult, personaResult] = await Promise.all([
          getOrCreateThread(phone, personaId),
          getPersona(personaId)
        ]);
        return { thread: threadResult.thread, persona: personaResult.persona };
      },
      { persona_id: personaId }
    );

    const t1 = performance.now();
    logger.info("Thread and persona fetched", {
      duration_ms: Math.round(t1 - tAuth),
      thread_id: thread.id,
      has_persona: !!persona,
    });

    /* ---------------------------------------------------------------------- */
    /*             Step 2: Fetch history + build context in parallel          */
    /* ---------------------------------------------------------------------- */
    const [{ data: history }, personaContext] = await withTracing(
      langfuse,
      "fetch_history_and_context",
      async () => {
        const [historyResult, contextResult] = await Promise.all([
          supabase.from("messages")
            .select("role, text")
            .eq("thread_id", thread.id)
            .order("created_at", { ascending: true })
            .limit(10),
          Promise.resolve(buildPersonaContext(persona, phone, false))
        ]);
        return { data: historyResult, personaContext: contextResult };
      },
      { thread_id: thread.id, history_limit: 10 }
    );

    const t2 = performance.now();
    logger.info("History and context fetched", {
      duration_ms: Math.round(t2 - t1),
      history_count: history?.length || 0,
    });

    // Save user message (non-blocking)
    supabase.from("messages").insert({
      thread_id: thread.id,
      role: "user",
      text: sanitizedText,
      created_at: new Date().toISOString()
    }).then(({ error }) => {
      if (error) logger.error("Failed to save user message", error);
    });

    /* ---------------------------------------------------------------------- */
    /*                    LangChain + Ollama API Call                         */
    /* ---------------------------------------------------------------------- */
    const t3 = performance.now();
    logger.info("Calling chat completion", {
      model: ollamaConfig.model,
      history_length: history?.length || 0,
    });

    // Use LangChain Ollama client with Gemini fallback, wrapped with generation tracing
    const chatResponse = await withGenerationTracing(
      langfuse,
      {
        name: "langchain-chat-generation",
        model: ollamaConfig.useOllama ? ollamaConfig.model : "gemini-2.5-pro",
        input: {
          history_length: history?.length || 0,
          message_length: sanitizedText.length,
          persona_context_length: personaContext?.length,
        },
        metadata: {
          persona_id: personaId,
          thread_id: thread.id,
          use_ollama: ollamaConfig.useOllama,
        },
      },
      async () => {
        const result = await generateChatCompletion(
          personaContext,
          history || [],
          sanitizedText,
          {
            temperature: 0.9,
            maxTokens: 2048,
          }
        );

        // Extract token usage if available (Ollama doesn't provide token counts)
        const usage = result.usage || undefined;

        return { result, usage };
      }
    );

    const t4 = performance.now();
    logger.info("Chat completion received", {
      duration_ms: Math.round(t4 - t3),
      model: chatResponse.model,
      bubble_count: chatResponse.bubbles.length,
    });

    // Handle empty responses
    if (!chatResponse.content || chatResponse.content.trim().length === 0) {
      const fallback = "⚠️ AI didn't respond or filtered this message.";
      logger.warn("No valid response from AI");

      await langfuse.updateTrace({
        empty_response: true,
      });

      await insertBotBubble(thread.id, fallback, logger);

      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({
        threadId: thread.id,
        replies: [fallback],
        messages: [],
      }, 200, headers);
    }

    const bubbles = chatResponse.bubbles;
    logger.info("Reply processed into bubbles", { count: bubbles.length });

    // Insert all bubbles in parallel
    const t5 = performance.now();
    const botMessages = await Promise.all(
      bubbles.map(bubble => insertBotBubble(thread.id, bubble, logger))
    );
    const t6 = performance.now();

    // Update thread timestamp (non-blocking)
    supabase.from("threads").update({
      updated_at: new Date().toISOString()
    }).eq("id", thread.id).then(({ error }) => {
      if (error) logger.error("Failed to update thread timestamp", error);
    });

    const totalTime = t6 - t0;
    logger.info("Request completed", {
      total_duration_ms: Math.round(totalTime),
      auth_ms: Math.round(tAuth - t0),
      thread_persona_ms: Math.round(t1 - tAuth),
      history_context_ms: Math.round(t2 - t1),
      ai_api_ms: Math.round(t4 - t3),
      db_insert_ms: Math.round(t6 - t5),
      bubble_count: bubbles.length,
      model_used: chatResponse.model,
    });

    // Update Langfuse trace with final metadata
    await langfuse.updateTrace({
      total_duration_ms: Math.round(totalTime),
      auth_ms: Math.round(tAuth - t0),
      thread_persona_ms: Math.round(t1 - tAuth),
      history_context_ms: Math.round(t2 - t1),
      ai_api_ms: Math.round(t4 - t3),
      db_insert_ms: Math.round(t6 - t5),
      bubble_count: bubbles.length,
      persona_id: personaId,
      thread_id: thread.id,
      model_used: chatResponse.model,
      success: true,
    });

    // Build response
    const response: any = {
      threadId: thread.id,
      replies: bubbles,
      messages: botMessages,
      model: chatResponse.model,
    };

    // Include new token if it was refreshed
    if (authResult.wasRefreshed && authResult.newToken) {
      response.new_token = authResult.newToken;
      logger.info("New token included in response");
    }

    const headers = cors();
    logger.addTraceHeaders(headers);

    // Add rate limit headers
    if (rateLimitCheck.headers) {
      Object.entries(rateLimitCheck.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    return json(response, 200, headers);

  } catch (err) {
    logger.error("Unhandled error in chat handler", err as Error, {
      url: req.url,
      method: req.method,
    });

    // Record error in Langfuse
    await langfuse.recordError(err as Error, {
      stage: "unhandled",
      url: req.url,
      method: req.method,
    });
    await langfuse.updateTrace({
      error: "INTERNAL_ERROR",
      error_message: (err as Error).message,
    });

    const headers = cors();
    logger.addTraceHeaders(headers);

    return json({
      replies: [getFriendlyErrorMessage()],
      messages: [],
      error: "INTERNAL_ERROR",
    }, 200, headers);
  }
});

/* -------------------------------------------------------------------------- */
/*                             Helper functions                               */
/* -------------------------------------------------------------------------- */

async function getOrCreateThread(phone: string, personaId: string) {
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

async function getPersona(personaId: string) {
  const { data, error } = await supabase.from("personas").select("*").eq("id", personaId).single();
  if (error) throw error;
  return { persona: data || null };
}

async function insertBotBubble(threadId: string, text: string, logger?: Logger) {
  const { data, error } = await supabase.from("messages").insert({
    thread_id: threadId,
    role: "bot",
    text,
    created_at: new Date().toISOString()
  }).select().single();

  if (error) {
    logger?.error("Failed to insert bot bubble", error);
  }

  return data;
}

function cors(): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  });
  return headers;
}

function json(obj: unknown, status = 200, headers?: Headers): Response {
  const responseHeaders = headers || cors();
  return new Response(JSON.stringify(obj), {
    status,
    headers: responseHeaders
  });
}
