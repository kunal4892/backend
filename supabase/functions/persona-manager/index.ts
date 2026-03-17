/******************************************************************************************
 * 📍 persona-manager
 *
 * Handles:
 *  ✅ Building persona context (dynamically pulls style_prompt from DB)
 *  ✅ Constructs systemInstruction for AI chat requests
 *  ✅ Rate limiting protection
 *  ✅ Input validation
 *  ✅ Structured logging
 *  ✅ Langfuse tracing for context building operations
 ******************************************************************************************/

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { Logger } from "../utils/logger.ts";
import { rateLimiters } from "../utils/rateLimiter.ts";
import { validators } from "../utils/validator.ts";
import { 
  createLangfuseClient, 
  withTracing,
  hashPhone 
} from "../utils/langfuse.ts";

// ---------------------------------------------------------------------------
// 🔧 Setup
// ---------------------------------------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize logger for startup
const startupLogger = new Logger("startup", "startup");
startupLogger.info("=== persona-manager: Environment check ===", {
  supabase_url_exists: !!supabaseUrl,
  service_role_key_exists: !!supabaseKey,
  jwt_secret_exists: !!JWT_SECRET,
});

// ---------------------------------------------------------------------------
// 🌐 Entry
// ---------------------------------------------------------------------------
serve(async (req) => {
  // Create request-scoped logger with trace IDs
  const logger = Logger.fromRequest(req);
  
  // Initialize Langfuse client for this request
  const langfuse = createLangfuseClient(logger);
  
  logger.info("=== persona-manager: Request received ===", {
    method: req.method,
    url: req.url,
    langfuse_enabled: langfuse.isEnabled(),
  });
  
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const headers = cors();
      logger.addTraceHeaders(headers);
      return new Response(null, { status: 204, headers });
    }
    
    // --- 1️⃣ Rate Limiting Check ---
    const rateLimitCheck = rateLimiters.standard(req, logger);
    
    if (!rateLimitCheck.allowed) {
      logger.warn("Rate limit exceeded", {
        limit: rateLimitCheck.result.limit,
        retry_after: rateLimitCheck.result.retryAfter,
      });
      
      const headers = cors();
      if (rateLimitCheck.headers) {
        Object.entries(rateLimitCheck.headers).forEach(([key, value]) => {
          headers.set(key, value);
        });
      }
      logger.addTraceHeaders(headers);
      
      return json({
        error: "Rate limit exceeded. Please try again later.",
      }, 429, headers);
    }
    
    // --- 2️⃣ JWT Authentication ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("Missing or invalid Authorization header");
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ error: "Missing or invalid Authorization header" }, 401, headers);
    }
    
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      logger.warn("Empty token");
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ error: "Empty token" }, 401, headers);
    }
    
    // Verify JWT
    let phone: string;
    try {
      const decoded = await jose.jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
      phone = decoded.payload.phone as string;
      if (!phone) {
        logger.warn("No phone found in token");
        const headers = cors();
        logger.addTraceHeaders(headers);
        return json({ error: "No phone found in token" }, 400, headers);
      }
    } catch (err) {
      logger.error("JWT verification failed", err as Error);
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ error: "Invalid or expired token" }, 401, headers);
    }
    
    logger.info("Authentication successful", { phone: phone.slice(-4) });
    
    // Start Langfuse trace
    const traceId = await langfuse.startTrace({
      name: "persona-manager",
      userId: hashPhone(phone),
      metadata: {
        endpoint: "/persona-manager",
        method: req.method,
      },
    });
    
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
      return json({ error: "Invalid JSON body" }, 400, headers);
    }
    
    // Validate request schema
    const validationResult = validators.personaManager(body);
    
    if (!validationResult.valid) {
      const validationErrors = validationResult.errors.map(e => ({
        field: e.field,
        code: e.code,
        message: e.message,
      }));
      
      logger.warn("Request validation failed", { errors: validationErrors });
      
      await langfuse.updateTrace({
        error: "VALIDATION_FAILED",
        validation_errors: validationErrors,
      });
      
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ 
        error: "Validation failed",
        validation_errors: validationErrors,
      }, 400, headers);
    }
    
    const { action, personaId, isFirst } = validationResult.data!;
    
    logger.info("Request validated", { action, persona_id: personaId });
    
    // 🔹 Always fetch latest persona record from DB
    const { data: dbPersona, error: fetchErr } = await supabase
      .from("personas")
      .select("*")
      .eq("id", personaId)
      .single();
    
    if (fetchErr || !dbPersona) {
      logger.error("Persona not found", fetchErr || undefined, { persona_id: personaId });
      
      await langfuse.updateTrace({
        error: "PERSONA_NOT_FOUND",
        persona_id: personaId,
      });
      
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ error: "Persona not found" }, 404, headers);
    }
    
    // -----------------------------------------------------------------------
    // 🎭 ACTIONS
    // -----------------------------------------------------------------------
    if (action === "buildContext") {
      // Trace the context building operation
      const context = await withTracing(
        langfuse,
        "build_persona_context",
        async () => {
          return await buildPersonaContext(dbPersona, phone, !!isFirst);
        },
        {
          persona_id: personaId,
          persona_name: dbPersona.name,
          is_first_chat: !!isFirst,
          has_style_prompt: !!dbPersona.style_prompt,
          has_long_doc: !!dbPersona.long_doc,
          has_short_summary: !!dbPersona.short_summary,
        }
      );
      
      logger.info("Context built successfully", { 
        persona_id: personaId,
        context_length: context.length,
      });
      
      // Update trace with success metadata
      await langfuse.updateTrace({
        action: "buildContext",
        persona_id: personaId,
        persona_name: dbPersona.name,
        is_first_chat: !!isFirst,
        context_length: context.length,
        success: true,
      });
      
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ context }, 200, headers);
    }
    
    if (action === "buildPromptTemplate") {
      // Return LangChain-compatible prompt template
      const template = await withTracing(
        langfuse,
        "build_prompt_template",
        async () => {
          return buildChatPromptTemplate(dbPersona, phone, !!isFirst);
        },
        {
          persona_id: personaId,
          persona_name: dbPersona.name,
          is_first_chat: !!isFirst,
        }
      );
      
      logger.info("Prompt template built successfully", { 
        persona_id: personaId,
        has_system_message: !!template.systemMessage,
        has_context_message: !!template.contextMessage,
      });
      
      await langfuse.updateTrace({
        action: "buildPromptTemplate",
        persona_id: personaId,
        persona_name: dbPersona.name,
        success: true,
      });
      
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ 
        template,
        persona_name: dbPersona.name,
      }, 200, headers);
    }
    
    if (action === "buildPromptChain") {
      // Build full prompt chain with history (requires history in request)
      const history = body.history || [];
      const currentMessage = body.currentMessage || "";
      
      const chain = await withTracing(
        langfuse,
        "build_prompt_chain",
        async () => {
          return buildPromptChain(
            dbPersona,
            phone,
            history,
            currentMessage,
            !!isFirst
          );
        },
        {
          persona_id: personaId,
          persona_name: dbPersona.name,
          history_count: history.length,
          has_user_prompt: !!currentMessage,
        }
      );
      
      logger.info("Prompt chain built successfully", { 
        persona_id: personaId,
        history_count: history.length,
        has_user_prompt: !!currentMessage,
      });
      
      await langfuse.updateTrace({
        action: "buildPromptChain",
        persona_id: personaId,
        persona_name: dbPersona.name,
        history_count: history.length,
        success: true,
      });
      
      const headers = cors();
      logger.addTraceHeaders(headers);
      return json({ 
        chain,
        persona_name: dbPersona.name,
      }, 200, headers);
    }
    
    logger.warn("Unknown action", { action });
    
    await langfuse.updateTrace({
      error: "UNKNOWN_ACTION",
      action,
    });
    
    const headers = cors();
    logger.addTraceHeaders(headers);
    return json({ error: "Unknown action" }, 400, headers);
    
  } catch (err) {
    logger.error("Unhandled error in persona-manager", err as Error);
    
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
    return json({ error: "Internal server error" }, 500, headers);
  }
});

// ---------------------------------------------------------------------------
// 🧩 Helpers
// ---------------------------------------------------------------------------
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

// Re-export from promptTemplates for backwards compatibility
export { buildPersonaContext } from "../utils/promptTemplates.ts";
