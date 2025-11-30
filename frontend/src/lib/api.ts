// src/lib/api.ts
import { fetchPersonas } from "./getPersonas";
import { SUPABASE_URL} from "./httpClient"
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFcmTokenForHeaders } from "./fcmToken";

const WORKER_URL = "https://oendriwadwjztxqczqlp.supabase.co/functions/v1/chat-handler";

type Message = { role: "user" | "bot"; text: string };

// Helper function to get friendly error messages - simple and clear
function getFriendlyErrorMessage(): string {
  const messages = [
    "Aapke request ko process karne mein kuch technical difficulty aayi hai. Thoda wait karo, phir try karo?",
    "We regret to inform you ki system thoda busy hai. Ek baar phir se try karo?",
    "Aapka request successfully process nahi ho paya. Thoda wait karo, phir try karo?",
    "Technical glitch detected. Phir se try karo?",
    "We apologize for the inconvenience. Thoda ruk jao, phir try karo?",
    "Request processing mein delay ho rahi hai. Ek baar phir se try karo?",
    "System temporarily unavailable hai. Wait karo, phir try karo?",
    "Aapke request ko handle karne mein problem aayi. Thoda wait karo?",
    "Technical issue detected. Thoda wait karo, phir try karo?",
    "We're experiencing some difficulties. Ek baar phir se try karo?",
    "Request failed. Thoda ruk jao, phir try karo?",
    "System overload detected. Thoda wait karo?",
    "Aapka request process nahi ho paya. Phir se try karo?",
    "Technical difficulties encountered. Thoda wait karo?",
    "We apologize, but an error occurred. Ek baar phir se try karo?",
    "System temporarily unavailable. Thoda wait karo, phir try karo?",
    "Request processing delay. Thoda ruk jao?",
    "Technical glitch detected. Phir se try karo?",
    "We're experiencing some issues. Thoda wait karo?",
    "Aapke request ko handle karne mein problem. Ek baar phir se try karo?",
    "System error detected. Thoda wait karo, phir try karo?",
    "Technical difficulty encountered. Thoda ruk jao, phir try karo?"
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}


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
      // Silently handle error - don't log to console
      await res.text(); // Consume response body
      throw new Error(getFriendlyErrorMessage());
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
  } catch (error: any) {
    // Silently handle error - don't log to console
    
    // If it's already a friendly message, throw as is
    if (error.message && error.message.includes("thakan")) {
      throw error;
    }
    
    throw new Error(getFriendlyErrorMessage());
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
      // Silently handle error - don't log to console
      await res.text(); // Consume response body
      
      // Handle 401 - token is invalid, user needs to re-login
      if (res.status === 401) {
        // Clear invalid token
        await AsyncStorage.removeItem("app_key");
      }
      
      throw new Error(getFriendlyErrorMessage());
    }
    
    const data = await res.json();
    
    // Check if backend refreshed the token
    if (data.new_token) {
      await AsyncStorage.setItem("app_key", data.new_token);
    }
    
    
    // Handle empty or malformed response
    if (!data || typeof data !== 'object') {
      // Silently handle - don't log to console
      return { threadId: null, messages: [], totalMessages: 0 };
    }
    
    return {
      threadId: data.thread?.id || null,
      messages: data.messages || [],
      totalMessages: data.totalMessages || data.messages?.length || 0
    };
    
  } catch (error: any) {
    // Silently handle error - don't log to console
    
    // If it's already a friendly message, throw as is
    if (error.message && error.message.includes("thakan")) {
      throw error;
    }
    
    throw new Error(getFriendlyErrorMessage());
  }
}
