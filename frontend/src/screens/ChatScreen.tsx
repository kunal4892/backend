import React, { useState, useLayoutEffect, useRef, useCallback, useEffect, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useChatStore, { hasHydratedSelector } from "../store/useChatStore";
import { Animated } from "react-native";
import { TypingIndicator } from "../utils/chatLoader";
import { getMessages } from "../lib/api";

const ChatBubble = memo(({ item, renderTicks }: any) => {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const time = new Date(item.ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Ensure text is always a string
  const messageText = item.text ? String(item.text) : "";
  
  return (
    <Animated.View
      style={[
        styles.bubble,
        item.role === "user" ? styles.user : styles.bot,
        { opacity: fadeAnim },
      ]}
    >
      <Text style={styles.text}>{messageText}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.time}>{time}</Text>
        {renderTicks(String(item.id), item.role)}
      </View>
    </Animated.View>
  );
});

export default function ChatScreen({ route, navigation }: any) {
  const { chatId, personas = [] } = route.params; // Default to empty array
  const { startChat, sendUserMessage } = useChatStore();
  const hasHydrated = useChatStore(hasHydratedSelector);
  // ✅ CRITICAL FIX: Use reactive selector instead of one-time getChat() call
  const chat = useChatStore((s) => s.chats[chatId]);
  const [input, setInput] = useState("");
  const [seenMap, setSeenMap] = useState<Record<string, number>>({});
  const flatListRef = useRef<FlatList>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const lastVisibleIndex = useRef<number | null>(null);
  const PAGE_SIZE = 100;
  
  // Find persona with better error handling
  const persona = Array.isArray(personas) ? personas.find((p: any) => p.id === chat?.personaId) : null;
  
  // Create a fallback persona if none found - this handles new users
  const fallbackPersona = {
    id: chat?.personaId || "unknown",
    name: "AI Friend",
    defaultMessage: "Hey! I'm your AI friend. 👋 Let's chat!",
    image_url: null
  };
  
  const displayPersona = persona || fallbackPersona;
  
  // Log for debugging
  if (!persona && chat?.personaId) {
    console.warn("⚠️ Persona not found for personaId:", chat.personaId);
    console.warn("⚠️ Available personas:", personas?.map((p: any) => ({ id: p.id, name: p.name })));
    console.warn("⚠️ Using fallback persona for new user");
  }

  // Load messages
  const loadMessages = useCallback(
    async (page: number) => {
      try {
        setIsLoading(true);
        // Store visible index before pagination
        if (page > 0 && flatListRef.current) {
          // Note: getVisibleItems is not available on FlatList, using alternative approach
          lastVisibleIndex.current = 0; // Simplified for now
        }
//         const app_key = await AsyncStorage.getItem("app_key");
//         if (!app_key) {
//           console.error("No app_key stored in AsyncStorage");
//           return;
//         }
        // Extract personaId from chat or chatId
        const personaId = chat?.personaId || (chatId?.startsWith("chat_") ? chatId.replace("chat_", "") : null);
        if (!personaId) {
          throw new Error("Cannot load messages: personaId not found");
        }
        
        const { threadId, messages, totalMessages } = await getMessages({
          personaId,
          page,
          pageSize: PAGE_SIZE,
        });
        setTotalMessages(totalMessages);
        
        const mapped = messages.map((m: any, idx: number) => {
          const role = m.role === "model" ? "bot" : m.role;
          return {
            id: Date.now() + idx, // Use timestamp-based ID instead of string
            role,
            text: m.text.trim(),
            ts: new Date(m.created_at).getTime(),
          };
        });
        useChatStore.setState((state) => {
          const existingMessages = state.chats[chatId]?.messages || [];
          const newMessages = page === 0 ? mapped : [...existingMessages, ...mapped];
          const sortedMessages = newMessages.sort((a: any, b: any) => a.ts - b.ts);
          return {
            chats: {
              ...state.chats,
              [chatId]: {
                ...state.chats[chatId],
                messages: sortedMessages,
              },
            },
          };
        });
        // Scroll to bottom after initial load only if there are messages
        if (page === 0 && flatListRef.current && messages.length > 0) {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: 0, animated: false, viewPosition: 0 });
          }, 100);
        }
        // Restore scroll position after pagination
        if (page > 0 && lastVisibleIndex.current !== null && flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: lastVisibleIndex.current!, animated: false });
          }, 750);
        }
        if (page > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 750));
        }
      } catch (err) {
        console.error("❌ loadMessages error:", err);
      } finally {
        setIsLoading(false);
        if (page === 0) {
          setHasLoadedInitial(true);
        }
      }
    },
    [chatId, chat?.personaId]
  );

  // Load chat from server when screen mounts or comes into focus
  useFocusEffect(
    useCallback(() => {
      if (hasHydrated) {
        const personaId = chatId?.startsWith("chat_") ? chatId.replace("chat_", "") : null;
        
        if (personaId) {
          useChatStore.getState().loadChatFromServer(personaId)
            .then(() => {
              setHasLoadedInitial(true);
            })
            .catch((err) => {
              console.error("❌ [ChatScreen] Failed to load chat from server:", err);
              // Still set hasLoadedInitial to true so UI doesn't hang
              // User can still see local messages if available
              setHasLoadedInitial(true);
              
              // If it's an auth error, the user needs to re-login
              // The error is already logged, and the app will show local messages
              if (err?.message?.includes("Authentication failed") || err?.message?.includes("401")) {
                console.warn("⚠️ Authentication failed - user may need to re-login");
              }
            });
        } else {
          console.error("❌ [ChatScreen] Cannot extract personaId from chatId:", chatId);
          // Set hasLoadedInitial even if personaId extraction fails
          setHasLoadedInitial(true);
        }
      }
    }, [hasHydrated, chatId])
  );

  // Data for inverted FlatList - use useMemo to ensure React detects changes
  const data = React.useMemo(() => {
    const messages = chat?.messages || [];
    const reversedMessages = [...messages].reverse();
    
    const result = [
      ...(isTyping && displayPersona ? [{ id: "typing", role: "bot", typing: true, ts: Date.now() }] : []),
      ...reversedMessages,
    ];

    // Only show welcome if we've loaded AND truly have no messages
    if (hasLoadedInitial && displayPersona && messages.length === 0 && result.length === 0) {
      return [{
        id: Date.now(),
        role: "bot",
        text: displayPersona?.defaultMessage || `Hey! I'm ${displayPersona?.name || "AI"}. 👋 Let's chat!`,
        ts: Date.now(),
      }];
    }

    return result;
  }, [chat?.messages, isTyping, displayPersona, hasLoadedInitial]);



  // Handle keyboard show/hide for Android devices
  useEffect(() => {
    if (Platform.OS === "android") {
      const showSubscription = Keyboard.addListener("keyboardDidShow", (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      });
      const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
        setKeyboardHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      setSeenMap({});
      setInput("");
      setIsTyping(false);
      setCurrentPage(0);
      setTotalMessages(0);
      setIsLoading(false);
      setHasLoadedInitial(false);
      lastVisibleIndex.current = null;
    };
  }, []);

  // Header with persona info
  useLayoutEffect(() => {
    if (displayPersona) {
      navigation.setOptions({
        headerStyle: { backgroundColor: "#3E1F47" },
        headerTintColor: "#fff",
        headerBackTitleVisible: false,
        headerTitle: () => (
          <View style={styles.headerRow}>
            {displayPersona.image_url ? (
              <Image
                source={
                  typeof displayPersona.image_url === "string"
                    ? { uri: displayPersona.image_url }
                    : displayPersona.image_url
                }
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: "#7D4EFF", justifyContent: "center", alignItems: "center" }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {displayPersona?.name ? String(displayPersona.name).charAt(0) : "?"}
                </Text>
              </View>
            )}
            <Text style={styles.headerName}>{displayPersona?.name || "Chat"}</Text>
          </View>
        ),
      });
    }
  }, [navigation, displayPersona]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    if (!chatId) {
      console.error("No chatId available");
      return;
    }
    setInput("");
    const id = Date.now().toString();
    setIsTyping(true);
    try {
      await sendUserMessage(chatId, text);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsTyping(false);
    }

    setSeenMap((prev) => ({ ...prev, [id]: 1 }));
    setTimeout(() => setSeenMap((prev) => ({ ...prev, [id]: 2 })), 1000);
    setTimeout(() => setSeenMap((prev) => ({ ...prev, [id]: 3 })), 2000);
  };

  const renderTicks = (msgId: string, role: string) => {
    if (role !== "user") return null;
    const seenState = seenMap[msgId] || 1;
    if (seenState === 1) return <Text style={styles.tick}>✓</Text>;
    if (seenState === 2) return <Text style={styles.tick}>✓✓</Text>;
    if (seenState === 3)
      return <Text style={[styles.tick, { color: "#7D4EFF" }]}>✓✓</Text>;
    return null;
  };

  const renderItem = useCallback(
    ({ item, index }: any) => {
      if (item.typing) {
        return <TypingIndicator />;
      }
      
      if (!item.text && !item.typing) {
        console.error(`❌ [ChatScreen] Item ${index} has no text and no typing:`, item);
        return null;
      }
      
      return <ChatBubble item={item} renderTicks={renderTicks} />;
    },
    [renderTicks]
  );

  // Scroll to bottom (index 0)
  const handleScrollToBottom = () => {
    if (data.length > 0) {
      flatListRef.current?.scrollToIndex({ index: 0, animated: true, viewPosition: 0 });
      setIsNearBottom(true);
    }
  };

  // Load more messages when scrolling up
  const handleScroll = useCallback(
    (e: any) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      const paddingToTop = 100;
      const atBottom = contentOffset.y <= 5;
      const nearTop = contentOffset.y >= contentSize.height - layoutMeasurement.height - paddingToTop;
      setIsNearBottom(atBottom);

      if (nearTop && currentPage * PAGE_SIZE < totalMessages && !isLoading) {
        const nextPage = currentPage + 1;
        loadMessages(nextPage);
        setCurrentPage(nextPage);
      }
    },
    [currentPage, totalMessages, loadMessages, isLoading]
  );

const renderEmptyComponent = () => {
  if (isLoading) return null;

  const welcomeMessage = {
    id: Date.now(),
    role: "bot",
    text: displayPersona.defaultMessage || `Hey! I'm ${displayPersona.name}. 👋 Let's chat!`,
    ts: Date.now(),
  };

  return <ChatBubble item={welcomeMessage} renderTicks={() => null} />;
};
  return (
    <View style={{ flex: 1, backgroundColor: "#F4F2F8" }}>
      <FlatList
        ref={flatListRef}
        data={data}
        extraData={`${data.length}-${chat?.messages?.length || 0}-${hasLoadedInitial}`}
        key={`flatlist-${chatId}-${data.length}`}
        inverted
        style={{ flex: 1 }}
        keyExtractor={(m, index) => {
          const key = String(m.id || `item-${index}`);
          if (!m.id) {
            console.warn(`⚠️ [ChatScreen] Item ${index} has no ID, using fallback:`, m);
          }
          return key;
        }}
        renderItem={renderItem}
        contentContainerStyle={{ 
          padding: 12, 
          paddingBottom: 12,
          minHeight: 100 
        }}
        initialNumToRender={50}
        maxToRenderPerBatch={20}
        windowSize={21}
        removeClippedSubviews={false}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        onContentSizeChange={(width, height) => {
          // Auto-scroll to bottom when new content is added and user is near bottom
          if (height > 0 && data.length > 0 && isNearBottom && flatListRef.current) {
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (flatListRef.current && isNearBottom) {
                  try {
                    flatListRef.current.scrollToIndex({ index: 0, animated: false, viewPosition: 0 });
                  } catch (e) {
                    try {
                      flatListRef.current.scrollToOffset({ offset: 0, animated: false });
                    } catch (e2) {
                      // Silently fail
                    }
                  }
                }
              }, 100);
            });
          }
        }}
        ListEmptyComponent={renderEmptyComponent}
      />

      {!isNearBottom && (
        <TouchableOpacity
          style={styles.scrollButton}
          onPress={handleScrollToBottom}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>↓</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable style={styles.send} onPress={send}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerName: { fontSize: 16, fontWeight: "600", color: "#fff" },

  bubble: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: 14,
    marginVertical: 4,
  },
  user: {
    alignSelf: "flex-end",
    backgroundColor: "#E9DDFF",
    borderBottomLeftRadius: 6,
  },
  bot: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderBottomRightRadius: 6,
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  text: { fontSize: 15, color: "#222" },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  time: { fontSize: 11, color: "#777", marginRight: 4 },
  tick: { fontSize: 11, color: "#777" },

  row: {
    flexDirection: "row",
    padding: 10,
    paddingBottom: Platform.OS === "android" ? 10 : 10,
    backgroundColor: "#1b0e24",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    position: "relative",
    zIndex: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  send: {
    marginLeft: 8,
    backgroundColor: "#1b0e24",
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: "center",
  },

  scrollButton: {
    position: "absolute",
    right: 20,
    bottom: 80,
    backgroundColor: "#7D4EFF",
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#7D4EFF",
    fontWeight: "500",
    textAlign: "center",
  },
});