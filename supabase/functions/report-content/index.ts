// supabase/functions/report-content/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const supabase = createClient(supabaseUrl, supabaseKey);

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

serve(async (req) => {
  console.log("=== report-content: Request received ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors(),
    });
  }

  try {
    // 1️⃣ Authenticate user
    const authHeader = req.headers.get("Authorization");
    let authResult;
    try {
      authResult = await verifyAndRefreshToken(authHeader, req);
    } catch (authError: any) {
      return json(
        {
          error: "Authentication failed",
          message: authError.message || "Invalid token",
        },
        401
      );
    }

    const phone = authResult.phone;

    // 2️⃣ Parse request body
    const body = await req.json();
    const { messageId, reason, additionalInfo } = body;

    if (!messageId || !reason) {
      return json(
        {
          error: "Missing required fields",
          message: "messageId and reason are required",
        },
        400
      );
    }

    // 3️⃣ Validate reason
    const validReasons = [
      "offensive",
      "inappropriate",
      "harmful",
      "spam",
      "other",
    ];
    if (!validReasons.includes(reason)) {
      return json(
        {
          error: "Invalid reason",
          message: `Reason must be one of: ${validReasons.join(", ")}`,
        },
        400
      );
    }

    // 4️⃣ Get message details for context
    const { data: messageData, error: messageError } = await supabase
      .from("messages")
      .select("id, text, role, thread_id, created_at")
      .eq("id", messageId)
      .single();

    if (messageError || !messageData) {
      return json(
        {
          error: "Message not found",
          message: "The reported message could not be found",
        },
        404
      );
    }

    // Only allow reporting bot messages (AI-generated content)
    // Check for both "model" (Gemini format) and "bot" (database format)
    if (messageData.role !== "model" && messageData.role !== "bot") {
      return json(
        {
          error: "Invalid report",
          message: "Only AI-generated messages can be reported",
        },
        400
      );
    }

    // 5️⃣ Insert report into database
    const { data: reportData, error: reportError } = await supabase
      .from("content_reports")
      .insert({
        message_id: messageId,
        thread_id: messageData.thread_id,
        reported_by: phone,
        reason: reason,
        additional_info: additionalInfo || null,
        message_text: messageData.text,
        status: "pending",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (reportError) {
      console.error("Error inserting report:", reportError);
      return json(
        {
          error: "Failed to submit report",
          message: reportError.message,
        },
        500
      );
    }

    // 6️⃣ Return success response with token refresh if needed
    const response: any = {
      success: true,
      message: "Report submitted successfully",
      reportId: reportData.id,
    };

    if (authResult.newToken) {
      response.new_token = authResult.newToken;
    }

    return json(response);
  } catch (err: any) {
    console.error("Error in report-content:", err);
    return json(
      {
        error: "Internal server error",
        message: err.message || "An unexpected error occurred",
      },
      500
    );
  }
});



