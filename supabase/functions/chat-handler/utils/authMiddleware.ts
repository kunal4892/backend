// supabase/functions/utils/authMiddleware.ts
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface AuthResult {
  phone: string;
  userId: string;
  token: string;
  newToken?: string; // If token was refreshed
  wasRefreshed: boolean;
}

/**
 * Fast JWT verification (no DB call) - for regular chat operations
 * Returns user info from token only
 */
export async function verifyToken(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Empty token");
  }

  // Verify token (no DB call for speed)
  const decoded = await jose.jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET)
  );

  const phone = decoded.payload.phone as string;
  const userId = decoded.payload.user_id as string;

  if (!phone) {
    throw new Error("No phone in token");
  }

  console.log("✅ Token valid for phone:", phone);

  return {
    phone,
    userId,
    token,
    wasRefreshed: false,
  };
}

/**
 * Secure JWT verification with DB call - for token refresh operations
 * Returns user info and optionally a new token if refreshed
 */
export async function verifyAndRefreshToken(
  authHeader: string | null
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    throw new Error("Empty token");
  }

  // Try to verify token normally first
  try {
    const decoded = await jose.jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET)
    );

    const phone = decoded.payload.phone as string;
    const userId = decoded.payload.user_id as string;

    if (!phone) {
      throw new Error("No phone in token");
    }

    console.log("✅ Token valid for phone:", phone);

    return {
      phone,
      userId,
      token,
      wasRefreshed: false,
    };
  } catch (error: any) {
    // Check if error is specifically token expiration
    if (error.code === "ERR_JWT_EXPIRED" || error.claim === "exp") {
      console.log("⚠️ Token expired, refreshing...");

      // Decode without verification to get phone
      const decoded = jose.decodeJwt(token);
      const phone = decoded.phone as string;
      const userId = decoded.user_id as string;

      if (!phone) {
        throw new Error("Invalid expired token: missing phone");
      }

      // Quick DB check - only verify user exists (faster than full select)
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("id")  // Only select ID (faster)
        .eq("phone", phone)
        .single();

      if (userError || !user) {
        throw new Error("User not found");
      }

      // Generate new token
      const newToken = await new jose.SignJWT({
        user_id: user.id,  // Use DB user.id for accuracy
        phone: phone,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(new TextEncoder().encode(JWT_SECRET));

      console.log("✅ Token refreshed for phone:", phone);

      return {
        phone,
        userId,
        token: newToken,
        newToken, // Signal to frontend to save this
        wasRefreshed: true,
      };
    }

    // Other JWT errors (invalid signature, malformed, etc.)
    console.error("❌ JWT verification failed:", error.message);
    throw new Error("Invalid token");
  }
}

