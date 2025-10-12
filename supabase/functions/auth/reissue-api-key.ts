// supabase/functions/reissue-appkey/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
const JWT_SECRET = Deno.env.get("JWT_SECRET");
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: cors()
  });
  try {
    const { phone } = await req.json();
    if (!phone) return new Response(JSON.stringify({
      error: "phone required"
    }), {
      status: 400,
      headers: cors()
    });
    const { data: user, error } = await supabase.from("users").select("*").eq("phone", phone).single();
    if (error || !user) return new Response(JSON.stringify({
      error: "user not found"
    }), {
      status: 404,
      headers: cors()
    });
    const app_key = await new jose.SignJWT({
      user_id: user.id,
      phone: user.phone
    }).setProtectedHeader({
      alg: "HS256"
    }).setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(JWT_SECRET));
    return new Response(JSON.stringify({
      success: true,
      app_key
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...cors()
      }
    });
  } catch (e) {
    console.error("reissue error:", e);
    return new Response(JSON.stringify({
      error: "reissue failed"
    }), {
      status: 500,
      headers: cors()
    });
  }
});
