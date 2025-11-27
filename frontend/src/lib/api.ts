// src/lib/api.ts
import { fetchPersonas } from "./getPersonas";
import { SUPABASE_URL} from "./httpClient"
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFcmTokenForHeaders } from "./fcmToken";

const WORKER_URL = "https://oendriwadwjztxqczqlp.supabase.co/functions/v1/chat-handler";

type Message = { role: "user" | "bot"; text: string };


/**
 * Chat with Gemini via Supabase Edge Function
 * Uses fetchWithAuth for automatic token refresh
 *
 * @param messages   Array of prior conversation messages (user/bot/system cleaned)
 * @param context    phone (user id), personaId, optional personaContext
 */
export async function chatLLM(
  { messages, text, personaContext }: { messages: any[]; text: string; personaContext?: string },
  { personaId }: { personaId: string }
) {
  
  try {
    // Get token
    const token = await AsyncStorage.getItem("app_key");
    if (!token) {
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

    // Make request - backend handles token refresh if needed
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        personaId,
        text,
        messages,
        personaContext,
      }),
    });


    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Backend error response:", errText);
      throw new Error(`Backend error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    
    // Check if backend refreshed the token
    if (data.new_token) {
      await AsyncStorage.setItem("app_key", data.new_token);
    }

    // ✅ Backend returns an array of replies (bubbles)
    if (Array.isArray(data.replies) && data.replies.length > 0) {
      return data.replies;
    }

    // fallback
    return [data.reply || "⚠️ No reply"];
  } catch (error) {
    console.error("❌ chatLLM error:", error);
    throw error;
  }
}

export async function getMessages({ 
  personaId, 
  page = 0, 
  pageSize = 100 
}: { 
  personaId: string; 
  page?: number; 
  pageSize?: number 
}) {
  const start = Date.now();
  
  try {
    // Get token
    const token = await AsyncStorage.getItem("app_key");
    if (!token) {
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

    // Make request - backend handles token refresh if needed
    const res = await fetch(`${SUPABASE_URL}/get_messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ personaId, page, pageSize }),
    });
    
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("❌ getMessages failed:", res.status, errorText);
      
      // Handle 401 - token is invalid, user needs to re-login
      if (res.status === 401) {
        // Clear invalid token
        await AsyncStorage.removeItem("app_key");
        throw new Error("Authentication failed. Please login again.");
      }
      
      throw new Error(`Failed to fetch messages: ${res.status}`);
    }
    
    const data = await res.json();
    
    // Check if backend refreshed the token
    if (data.new_token) {
      await AsyncStorage.setItem("app_key", data.new_token);
    }
    
    
    // Handle empty or malformed response
    if (!data || typeof data !== 'object') {
      console.warn("⚠️ getMessages returned invalid data:", data);
      return { threadId: null, messages: [], totalMessages: 0 };
    }
    
    return {
      threadId: data.thread?.id || null,
      messages: data.messages || [],
      totalMessages: data.totalMessages || data.messages?.length || 0
    };
    
  } catch (error) {
    console.error("❌ getMessages error:", error);
    throw error;
  }
}
