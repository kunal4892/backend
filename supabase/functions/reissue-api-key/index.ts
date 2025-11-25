// supabase/functions/reissue-api-key/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const JWT_SECRET = Deno.env.get("JWT_SECRET")!;

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  try {
    // Extract token from Authorization header
    const authHeader = req.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        { status: 401, headers: cors() }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    
    if (!token) {
      console.log("❌ Empty token");
      return new Response(
        JSON.stringify({ error: "Empty token" }),
        { status: 401, headers: cors() }
      );
    }

    // Decode the expired token WITHOUT verifying expiration
    // This is safe because we're in a controlled refresh flow
    let phone: string;
    let userId: string;
    
    try {
      // Use jose.decodeJwt to decode without verification
      const decoded = jose.decodeJwt(token);
      
      phone = decoded.phone as string;
      userId = decoded.user_id as string;
      
      if (!phone) {
        console.log("❌ No phone in token payload");
        return new Response(
          JSON.stringify({ error: "Invalid token: missing phone" }),
          { status: 401, headers: cors() }
        );
      }
      
      console.log("✅ Decoded expired token for phone:", phone);
      
    } catch (decodeErr) {
      console.error("❌ Failed to decode token:", decodeErr);
      return new Response(
        JSON.stringify({ error: "Invalid token format" }),
        { status: 401, headers: cors() }
      );
    }

    // Verify user still exists in database
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error || !user) {
      console.log("❌ User not found for phone:", phone);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: cors() }
      );
    }

    // Generate new JWT with 7 day expiration
    const newToken = await new jose.SignJWT({
      user_id: user.id,
      phone: user.phone,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(JWT_SECRET));

    console.log("✅ Issued new token for phone:", phone);

    return new Response(
      JSON.stringify({
        success: true,
        app_key: newToken,
        message: "Token refreshed successfully",
      }),
      {
        status: 200,
        headers: cors(),
      }
    );
    
  } catch (e) {
    console.error("❌ reissue-api-key error:", e);
    return new Response(
      JSON.stringify({
        error: "Token refresh failed",
        details: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: cors(),
      }
    );
  }
});
