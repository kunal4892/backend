import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/httpClient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFcmTokenForHeaders } from "./fcmToken";

export interface Persona {
  id: string;
  name: string;
  system_prompt?: string;
  style_prompt?: string;
  short_summary?: string;
  long_doc?: string;
  image_url?: string;
  is_premium?: boolean;
  defaultMessage?: string;
  caption?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

/** GET all personas - Backend handles token refresh automatically */
export async function fetchPersonas(): Promise<Persona[]> {
  console.log("\n=== FRONTEND: fetchPersonas START ===");
  
  try {
    // Get current token
    const token = await AsyncStorage.getItem("app_key");
    console.log("📤 fetchPersonas: Token exists:", !!token);
    console.log("📤 fetchPersonas: Token length:", token?.length || 0);
    console.log("📤 fetchPersonas: Token preview (first 50):", token ? `${token.substring(0, 50)}...` : "MISSING");
    console.log("📤 fetchPersonas: Token preview (last 50):", token ? `...${token.substring(token.length - 50)}` : "MISSING");
    
    if (!token) {
      console.error("❌ fetchPersonas: No token found in AsyncStorage");
      throw new Error("No token found - please login");
    }

    // Get FCM token for device binding
    const fcmToken = await getFcmTokenForHeaders();
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (fcmToken) {
      headers["X-FCM-Token"] = fcmToken;
    }

    const fullUrl = `${SUPABASE_URL}/get-personas`;
    console.log("📤 fetchPersonas: Request URL:", fullUrl);
    console.log("📤 fetchPersonas: Request method: GET");
    console.log("📤 fetchPersonas: Request headers:", {
      "Authorization": `Bearer ${token.substring(0, 20)}...`,
      "Content-Type": "application/json",
      "X-FCM-Token": fcmToken ? `${fcmToken.substring(0, 20)}...` : "MISSING"
    });

    // Make request - backend will handle token refresh if needed
    const res = await fetch(fullUrl, {
      method: "GET",
      headers,
    });
    
    console.log("📥 fetchPersonas: Response received");
    console.log("📥 fetchPersonas: Response status:", res.status);
    console.log("📥 fetchPersonas: Response ok:", res.ok);
    console.log("📥 fetchPersonas: Response statusText:", res.statusText);
    console.log("📥 fetchPersonas: Response headers:", Object.fromEntries(res.headers.entries()));
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ fetchPersonas failed:", res.status, errorText);
      console.error("❌ fetchPersonas: Error text length:", errorText.length);
      console.error("❌ fetchPersonas: Error text preview (first 200):", errorText.substring(0, 200));
      
      // Handle 401 - token is invalid, user needs to re-login
      if (res.status === 401) {
        console.error("❌ fetchPersonas: 401 Unauthorized - clearing token");
        // Clear invalid token
        await AsyncStorage.removeItem("app_key");
        console.error("❌ fetchPersonas: Token cleared from AsyncStorage");
        throw new Error("Authentication failed. Please login again.");
      }
      
      throw new Error(`Failed to fetch personas: ${res.status}`);
    }

    const responseText = await res.text();
    console.log("📥 fetchPersonas: Response text length:", responseText.length);
    console.log("📥 fetchPersonas: Response text preview (first 200):", responseText.substring(0, 200));
    
    let json;
    try {
      json = JSON.parse(responseText);
      console.log("✅ fetchPersonas: Successfully parsed JSON response");
    } catch (parseError: any) {
      console.error("❌ fetchPersonas: JSON parse error:", parseError.message);
      console.error("❌ fetchPersonas: Raw response:", responseText);
      throw new Error(`Failed to parse response: ${parseError.message}`);
    }
    
    console.log("📥 fetchPersonas: Response data keys:", Object.keys(json || {}));
    console.log("📥 fetchPersonas: Has new_token:", !!json.new_token);
    console.log("📥 fetchPersonas: Has data:", !!json.data);
    console.log("📥 fetchPersonas: Data is array:", Array.isArray(json.data));
    console.log("📥 fetchPersonas: Data length:", json.data?.length || 0);
    
    // Check if backend refreshed the token
    if (json.new_token) {
      console.log("🔄 fetchPersonas: Token was refreshed, saving new token");
      await AsyncStorage.setItem("app_key", json.new_token);
      console.log("✅ fetchPersonas: New token saved");
    }
    
    // Extract personas data
    const arr =
      Array.isArray(json) ? json :
      Array.isArray(json?.data) ? json.data :
      Array.isArray(json?.personas) ? json.personas : [];

    console.log("✅ fetchPersonas: Extracted personas array length:", arr.length);
    console.log("✅ fetchPersonas: SUCCESS - returning personas");

    return arr as Persona[];
    
  } catch (error: any) {
    console.error("❌ fetchPersonas error:", error);
    console.error("❌ fetchPersonas error message:", error?.message);
    console.error("❌ fetchPersonas error stack:", error?.stack);
    throw error;
  }
}

/** POST single persona by id via Edge Function */
export async function fetchPersonaById(id: string): Promise<Persona | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/getPersonas`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("❌ fetchPersonaById failed:", res.status, text);
    throw new Error(`getPersonas ${res.status}`);
  }

  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  const arr =
    Array.isArray(json) ? json :
    Array.isArray(json?.data) ? json.data :
    Array.isArray(json?.personas) ? json.personas : [];
  const one = (arr as Persona[])[0] ?? null;

  return one;
}
