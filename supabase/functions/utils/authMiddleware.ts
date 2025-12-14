// supabase/functions/utils/authMiddleware.ts
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Hash FCM token for inclusion in JWT (cryptographic binding)
 */
async function hashFcmToken(fcmToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(fcmToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export interface AuthResult {
  phone: string;
  token: string;
  newToken?: string; // If token was refreshed
  wasRefreshed: boolean;
  fcmToken?: string; // FCM token from user record (for device binding)
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
  let decoded;
  try {
    decoded = await jose.jwtVerify(
    token,
    new TextEncoder().encode(JWT_SECRET)
  );
  } catch (verifyError: any) {
    console.error("❌ JWT verification error:", verifyError.code, verifyError.message);
    console.error("❌ Token preview:", token.substring(0, 50) + "...");
    throw new Error(`Token verification failed: ${verifyError.message}`);
  }

  const phone = decoded.payload.phone as string;
  const userId = decoded.payload.user_id as string | undefined; // For logging old tokens

  // Phone is the primary key, so it should always be in the token
  if (!phone) {
    console.error("❌ Token payload:", JSON.stringify(decoded.payload));
    throw new Error("No phone in token (phone is required as primary key)");
  }

  console.log("✅ Token valid for phone:", phone, userId ? `(migrated from old token with user_id: ${userId})` : "(phone-only token)");

  return {
    phone,
    token,
    wasRefreshed: false,
  };
}

/**
 * Secure JWT verification with DB call - for token refresh operations
 * Returns user info and optionally a new token if refreshed
 */
export async function verifyAndRefreshToken(
  authHeader: string | null,
  req?: Request
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
    const userId = decoded.payload.user_id as string | undefined; // For logging old tokens

    // Phone is the primary key, so it should always be in the token
    if (!phone) {
      console.error("❌ Token payload:", JSON.stringify(decoded.payload));
      throw new Error("No phone in token (phone is required as primary key)");
    }

    // Log token expiration info
    const exp = decoded.payload.exp as number;
    const iat = decoded.payload.iat as number;
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = exp - now;
    const expiresAt = new Date(exp * 1000).toISOString();
    
    console.log("✅ Token valid for phone:", phone, userId ? `(migrated from old token with user_id: ${userId})` : "(phone-only token)");
    console.log("⏰ Token expiration info:");
    console.log("  - Issued at (iat):", new Date(iat * 1000).toISOString());
    console.log("  - Expires at (exp):", expiresAt);
    console.log("  - Current time:", new Date().toISOString());
    console.log("  - Seconds until expiry:", expiresIn);
    if (expiresIn < 60) {
      console.log("  - ⚠️ Token expires soon (within 1 minute)");
    }

    return {
      phone,
      token,
      wasRefreshed: false,
    };
  } catch (error: any) {
    // Log detailed error information
    console.error("❌ JWT verification error in verifyAndRefreshToken:");
    console.error("  - Error code:", error.code);
    console.error("  - Error message:", error.message);
    console.error("  - Error name:", error.name);
    console.error("  - Error claim:", error.claim);
    console.error("  - Token preview (first 50):", token.substring(0, 50) + "...");
    console.error("  - Token preview (last 50):", "..." + token.substring(token.length - 50));
    console.error("  - Token length:", token.length);
    console.error("  - JWT_SECRET exists:", !!JWT_SECRET);
    console.error("  - JWT_SECRET length:", JWT_SECRET ? JWT_SECRET.length : 0);
    
    // Try to decode without verification to see what's in the token
    try {
      const decodedUnverified = jose.decodeJwt(token);
      console.error("  - Decoded payload (unverified):", JSON.stringify(decodedUnverified));
      console.error("  - Has phone in payload:", !!decodedUnverified.phone);
      console.error("  - Phone value:", decodedUnverified.phone);
    } catch (decodeError: any) {
      console.error("  - Failed to decode token:", decodeError.message);
    }
    
    // Check if error is specifically token expiration
    if (error.code === "ERR_JWT_EXPIRED" || error.claim === "exp") {
      console.log("⚠️ Token expired, refreshing...");
      
      // Decode expired token to show expiration details
      const decodedExpired = jose.decodeJwt(token);
      const exp = decodedExpired.exp as number;
      const iat = decodedExpired.iat as number;
      const now = Math.floor(Date.now() / 1000);
      const expiredBy = now - exp;
      console.log("⏰ Expired token details:");
      console.log("  - Issued at (iat):", new Date(iat * 1000).toISOString());
      console.log("  - Expired at (exp):", new Date(exp * 1000).toISOString());
      console.log("  - Current time:", new Date().toISOString());
      console.log("  - Expired by (seconds):", expiredBy);

      // Decode without verification to get phone
      // Phone is the primary key, so it should always be in the token
      const decoded = jose.decodeJwt(token);
      const phone = decoded.phone as string;
      const userId = decoded.user_id as string | undefined; // For logging old tokens

      if (!phone) {
        throw new Error("Invalid expired token: missing phone (phone is required as primary key)");
      }

      // SECURITY: DB check - verify user exists and get FCM token for device binding
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("phone, fcm_token")
        .eq("phone", phone)
        .single();

      if (userError || !user) {
        console.error("❌ SECURITY: User not found during token refresh for phone:", phone);
        throw new Error("User not found");
      }

      // SECURITY: Device binding check using FCM token
      // If user has FCM token in DB, verify it matches the request
      // This prevents stolen tokens from being refreshed on different devices
      const requestFcmToken = req ? (req.headers.get("X-FCM-Token") || req.headers.get("FCM-Token")) : null;
      
      console.log("🔍 FCM Token Check:");
      console.log("  - Request FCM token present:", !!requestFcmToken);
      console.log("  - User FCM token in DB present:", !!user.fcm_token);
      if (requestFcmToken) {
        console.log("  - Request FCM token (first 30):", requestFcmToken.substring(0, 30) + "...");
      }
      if (user.fcm_token) {
        console.log("  - DB FCM token (first 30):", user.fcm_token.substring(0, 30) + "...");
      }
      
      // Handle FCM token verification and updates
      if (requestFcmToken) {
        if (user.fcm_token) {
          // User has FCM token in DB - check if it matches
          const tokensMatch = user.fcm_token === requestFcmToken;
          console.log("  - Tokens match:", tokensMatch);
          
          if (!tokensMatch) {
            // FCM token changed - could be legitimate (app reinstall, Firebase refresh) or attack
            // For now, we allow it but update the DB with the new token
            // This allows legitimate cases like app reinstall while still maintaining device binding
            console.warn("⚠️ FCM token changed during refresh");
            console.warn("  - Phone:", phone);
            console.warn("  - Old FCM token (first 30):", user.fcm_token.substring(0, 30) + "...");
            console.warn("  - New FCM token (first 30):", requestFcmToken.substring(0, 30) + "...");
            console.warn("  - This could be legitimate (app reinstall) or an attack");
            console.log("🔄 Updating FCM token in DB to new token");
            
            // Update DB with new FCM token
            const { error: updateError } = await supabase
              .from("users")
              .update({ fcm_token: requestFcmToken })
              .eq("phone", phone);
            
            if (updateError) {
              console.error("❌ Failed to update FCM token in DB:", updateError.message);
              // Don't block refresh if update fails - just log the error
            } else {
              console.log("✅ FCM token updated in database");
              // Update user object for return value
              user.fcm_token = requestFcmToken;
            }
          } else {
            console.log("✅ SECURITY: FCM token verified - device binding confirmed");
            console.log("  - Tokens match, no DB update needed (already up to date)");
            // Tokens match, no update needed
          }
        } else {
          // User didn't have FCM token before, but now they're sending one
          // Update the database with the new FCM token for future refreshes
          console.log("🔄 FCM token update: User didn't have FCM token, updating DB with new token");
          const { error: updateError } = await supabase
            .from("users")
            .update({ fcm_token: requestFcmToken })
            .eq("phone", phone);
          
          if (updateError) {
            console.error("❌ Failed to update FCM token in DB:", updateError.message);
            // Don't block refresh if update fails - just log the error
          } else {
            console.log("✅ FCM token updated in database for future refreshes");
            // Update user object for return value
            user.fcm_token = requestFcmToken;
          }
        }
      } else {
        // Request doesn't include FCM token
        if (user.fcm_token) {
          console.warn("⚠️ SECURITY: User has FCM token but request doesn't include it");
          console.warn("  - This might be a legitimate request from an older app version");
          console.warn("  - Or it could be an attacker without device binding");
          // For now, we allow it but log the warning
          // In production, you might want to require FCM token for refresh
        } else {
          console.warn("⚠️ SECURITY: User has no FCM token - device binding not enabled");
          console.warn("  - Consider requiring FCM token during registration for better security");
        }
      }
      
      if (!req) {
        console.warn("⚠️ SECURITY: Request object not provided - cannot verify FCM token");
      }

      // Generate new token with phone only (FCM token is stored in DB, not token)
      const newToken = await new jose.SignJWT({
        phone: phone,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30s")
        .sign(new TextEncoder().encode(JWT_SECRET));

      console.log("✅ Token refreshed for phone:", phone);
      if (user.fcm_token) {
        console.log("✅ User has FCM token (device binding enabled)");
      } else {
        console.warn("⚠️ User has no FCM token (device binding not enabled)");
      }

      return {
        phone,
        token: newToken,
        newToken, // Signal to frontend to save this
        wasRefreshed: true,
        fcmToken: user.fcm_token, // Return FCM token for reference
      };
    }

    // Other JWT errors (invalid signature, malformed, etc.)
    console.error("❌ JWT verification failed - throwing error");
    throw new Error(`Invalid JWT: ${error.message}`);
  }
}

