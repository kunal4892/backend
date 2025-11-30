import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persist, createJSONStorage } from "zustand/middleware";

import { chatLLM, getMessages } from "../lib/api";
import { fetchPersonas } from "../lib/getPersonas";
import { Chat, Msg, Persona } from "./types";

type State = {
  personas: Persona[];
  chats: Record<string, Chat>;
  hasHydrated: boolean;
  setHasHydrated: (h: boolean) => void;
  startChat: (personaId: string) => string;
  getChat: (chatId: string) => Chat | undefined;
  loadChatFromServer: (personaId: string) => Promise<string>;
  sendUserMessage: (chatId: string, text: string) => Promise<void>;
  updateLastBotMessage: (chatId: string, text: string) => void;
};

const useChatStore = create<State>()(
  persist(
    (set, get) => ({
      personas: [],
      chats: {},
      hasHydrated: false,
      setHasHydrated: (val) => set({ hasHydrated: val }),

      /* ------------------------------------------------------------------ */
      /*                            Start a chat                            */
      /* ------------------------------------------------------------------ */
      startChat: (personaId) => {
        const chatId = `chat_${personaId}`;
        const existing = get().chats[chatId];
        if (existing) return chatId;

        const first: Chat = {
          id: chatId,
          personaId,
          messages: [
            {
              id: Date.now(),
              role: "bot",
              text: "Hi! How can I help today? 😊",
              ts: Date.now(),
            },
          ],
        };

        set((s) => {
          const newChats = { ...s.chats, [chatId]: first };
          return { chats: newChats };
        });
        return chatId;
      },

      /* ------------------------------------------------------------------ */
      /*                         Get a chat from store                      */
      /* ------------------------------------------------------------------ */
      getChat: (chatId) => get().chats[chatId],

      /* ------------------------------------------------------------------ */
      /*                      Load existing chat history                     */
      /* ------------------------------------------------------------------ */
      loadChatFromServer: async (personaId) => {
        const app_key = (await AsyncStorage.getItem("app_key")) || "";
        if (!app_key) throw new Error("No app_key stored");
        
        const chatId = `chat_${personaId}`;
        
        // Get current state from store (what's in memory/AsyncStorage)
        const currentState = get();
        const existingChat = currentState.chats[chatId];
        
        const { threadId, messages } = await getMessages({ personaId, page: 0, pageSize: 100 });

        const mapped: Msg[] = (messages || []).map((m: any) => ({
          id: m.id,
          role: m.role === "model" ? "bot" : m.role,
          text: (m.text || "").trim(),
          ts: new Date(m.created_at).getTime(),
        }));

        // CRITICAL FIX: Merge local messages with server messages
        // Keep local messages that aren't on server yet (newly sent messages)
        let finalMessages: Msg[] = mapped;
        
        if (existingChat && existingChat.messages.length > 0) {
          // Create a map of server messages by content+timestamp for matching
          // Server messages have UUID IDs, local messages have numeric IDs, so we match by content
          const serverMessageMap = new Map<string, Msg>();
          mapped.forEach(m => {
            // Key: role + text + approximate timestamp (rounded to nearest 10 seconds for better matching)
            const key = `${m.role}|${m.text.trim().substring(0, 200)}|${Math.floor(m.ts / 10000)}`;
            serverMessageMap.set(key, m);
          });
          
          // Find local messages that aren't on server yet
          // Match by: role + text + timestamp (within 10 seconds)
          // Note: Local messages use numeric IDs (Date.now()), server messages use UUID strings,
          // so we can't match by ID - we match by content instead
          const now = Date.now();
          const localOnlyMessages = existingChat.messages.filter((localMsg) => {
            // Normalize text for comparison (trim and take first 200 chars)
            const localText = localMsg.text.trim().substring(0, 200);
            
            // Check if this local message matches any server message
            // Use a more lenient matching: same role, similar text, within 10 seconds
            for (const [key, serverMsg] of serverMessageMap.entries()) {
              const [role, text, tsStr] = key.split('|');
              const serverTs = parseInt(tsStr) * 10000; // Convert back from 10-second buckets
              const timeDiff = Math.abs(localMsg.ts - serverTs);
              
              // Match if: same role, text matches (allowing for small differences), and within 10 seconds
              if (role === localMsg.role && 
                  text === localText && 
                  timeDiff < 10000) { // Within 10 seconds
                return false; // Found on server - don't keep local copy
              }
            }
            
            // Not found on server - keep it (might be a very recent message not yet synced)
            return true;
          });
          
          if (localOnlyMessages.length > 0) {
            // Merge: server messages + local-only messages
            // Sort by timestamp to maintain chronological order
            finalMessages = [...mapped, ...localOnlyMessages].sort((a, b) => a.ts - b.ts);
          }
        }

        set((st) => {
          const newChats = {
            ...st.chats,
            [chatId]: { id: chatId, personaId, messages: finalMessages },
          };
          return { chats: newChats };
        });

        return chatId;
      },

      /* ------------------------------------------------------------------ */
      /*                     Update last bot message text                    */
      /* ------------------------------------------------------------------ */
      updateLastBotMessage: (chatId, text) => {
        set((st) => {
          const chat = st.chats[chatId];
          if (!chat) return {};
          const last = chat.messages[chat.messages.length - 1];
          if (!last || last.role !== "bot") return {};
          const updated = { ...last, text };
          return {
            chats: {
              ...st.chats,
              [chatId]: {
                ...chat,
                messages: [...chat.messages.slice(0, -1), updated],
              },
            },
          };
        });
      },

      /* ------------------------------------------------------------------ */
      /*                      Send user message to backend                   */
      /* ------------------------------------------------------------------ */
      sendUserMessage: async (chatId, text) => {
        const store = get();
        const chat = store.chats[chatId];
        if (!chat) return;

        // 1️⃣ Add user message locally first
        const now = Date.now();
        const userMsg: Msg = { id: now, role: "user", text, ts: now };
        set((st) => {
          const updatedChat = { ...chat, messages: [...chat.messages, userMsg] };
          return {
            chats: {
              ...st.chats,
              [chatId]: updatedChat,
            },
          };
        });

        try {
          // Get persona from route params instead of store
          const persona = store.personas.find((p) => p.id === chat.personaId);
          if (!persona) {
            console.warn("⚠️ Persona not found in store, using personaId directly");
            // Use personaId directly if persona not found in store
          }

          const stored = (await AsyncStorage.getItem("app_key")) || "";
          if (!stored) throw new Error("user not registed");

          // 2️⃣ Call backend – backend now fetches full context + summary
          const replies: string[] = await chatLLM(
            { messages: [], text }, // ✅ no more history or context from frontend
            { personaId: chat.personaId }
          );

          // 3️⃣ Append replies from backend
          for (let r = 0; r < replies.length; r++) {
            const botMsg: Msg = {
              id: Date.now() + r + 1,
              role: "bot",
              text: replies[r].trim(),
              ts: Date.now() + r + 1,
            };
            set((st) => {
              const updatedChat = st.chats[chatId];
              const newMessages = [...updatedChat.messages, botMsg];
              return {
                chats: {
                  ...st.chats,
                  [chatId]: {
                    ...updatedChat,
                    messages: newMessages,
                  },
                },
              };
            });
          }
        } catch (err: any) {
          // Silently handle error - don't log to console
          const ts = Date.now();
          // Use the friendly error message (already converted in api.ts)
          const errorMessage = err.message || "Aapke request ko process karne mein kuch technical difficulty aayi hai. Thoda wait karo, phir try karo?";
          const botErr: Msg = {
            id: ts + 1,
            role: "bot",
            text: errorMessage,
            ts: ts + 1,
          };
          set((st) => ({
            chats: {
              ...st.chats,
              [chatId]: {
                ...st.chats[chatId],
                messages: [...st.chats[chatId].messages, botErr],
              },
            },
          }));
        }
      },
    }),
    {
      name: "AIFriendStore",
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => {
        return async (state, error) => {
          if (error) {
            console.error("❌ [Store] Rehydration error:", error);
            state?.setHasHydrated(true);
            return;
          }
          
          // Log what we got from AsyncStorage
          const chatCount = Object.keys(state?.chats || {}).length;
          const totalMessages = Object.values(state?.chats || {}).reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
          const chatsFromStorage: Record<string, any> = {};
          
          Object.entries(state?.chats || {}).forEach(([chatId, chat]: [string, any]) => {
            chatsFromStorage[chatId] = {
              id: chat.id,
              personaId: chat.personaId,
              messageCount: chat.messages?.length || 0,
              firstMessage: chat.messages?.[0]?.text?.substring(0, 50) || "none",
              lastMessage: chat.messages?.[chat.messages.length - 1]?.text?.substring(0, 50) || "none",
            };
          });
          
          
          state?.setHasHydrated(true);
        };
      },
      // Add partialize to only persist what we need (optional optimization)
      partialize: (state) => ({
        chats: state.chats,
        personas: state.personas,
      }),
    }
  )
);

export const hasHydratedSelector = (s: State) => s.hasHydrated;
export default useChatStore;
