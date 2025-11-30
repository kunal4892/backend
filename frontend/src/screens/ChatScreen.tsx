import React, { useState, useLayoutEffect, useRef, useCallback, useEffect, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  TouchableOpacity,
  Keyboard,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"; 
import { useFocusEffect } from "@react-navigation/native";
import useChatStore, { hasHydratedSelector } from "../store/useChatStore";
import { Animated } from "react-native";
import { TypingIndicator } from "../utils/chatLoader";
import { FlatList } from "react-native";
import { getMessages } from "../lib/api";

// CONSTANT FOR INPUT BAR ROW HEIGHT (The visible part)
const INPUT_BAR_MIN_HEIGHT = 50; 
// CONSTANT TO ADD A SMALL GAP ABOVE THE KEYBOARD/SAFE AREA
const INPUT_BUFFER_HEIGHT = 24; // Increased to 24 pixels for guaranteed clearance

// ... (ChatBubble component remains the same)
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
  const { chatId, personas = [] } = route.params;
  const { startChat, sendUserMessage } = useChatStore();
  const hasHydrated = useChatStore(hasHydratedSelector);
  const chat = useChatStore((s) => s.chats[chatId]);
  const [input, setInput] = useState("");
  const [seenMap, setSeenMap] = useState<Record<string, number>>({});
  const flatListRef = useRef<any>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const lastVisibleIndex = useRef<number | null>(null);
  const PAGE_SIZE = 100;
  
  const [keyboardHeight, setKeyboardHeight] = useState(0); 
  const insets = useSafeAreaInsets(); 

  const persona = Array.isArray(personas) ? personas.find((p: any) => p.id === chat?.personaId) : null;
  
  const fallbackPersona = {
    id: chat?.personaId || "unknown",
    name: "AI Friend",
    defaultMessage: "Hey! I'm your AI friend. 👋 Let's chat!",
    image_url: null
  };
  
  const displayPersona = persona || fallbackPersona;
  
  // KEYBOARD LISTENER LOGIC
  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(keyboardShowEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    
    const hideSubscription = Keyboard.addListener(keyboardHideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []); 

  // Dynamic bottom margin for the Input Bar
  const inputBottomMargin = React.useMemo(() => {
    // When keyboard is down, margin is 0.
    if (keyboardHeight === 0) return 0;

    // When keyboard is up, the margin is the height of the keyboard minus the safe area inset,
    // PLUS the buffer height to lift the input field slightly.
    return keyboardHeight - insets.bottom + INPUT_BUFFER_HEIGHT;

  }, [keyboardHeight, insets.bottom]);


  // FlatList Content Padding (only needs constant padding, the margin below handles spacing)
  const flatListContentPadding = 12;

  
  const loadMessages = useCallback(
    async (page: number) => {
      if (!chat?.personaId || isLoading) return;
      
      setIsLoading(true);
      try {
        // Track the first visible message ID before loading (for scroll position maintenance)
        const firstVisibleMessageId = chat.messages?.[0]?.id || null;
        
        const { messages: newMessages, totalMessages: total } = await getMessages({
          personaId: chat.personaId,
          page,
          pageSize: PAGE_SIZE,
        });

        if (newMessages && newMessages.length > 0) {
          const mapped: any[] = newMessages.map((m: any) => ({
            id: m.id,
            role: m.role === "model" ? "bot" : m.role,
            text: (m.text || "").trim(),
            ts: new Date(m.created_at).getTime(),
          }));

          // Merge with existing messages, avoiding duplicates
          const existingIds = new Set((chat.messages || []).map((m: any) => m.id));
          const uniqueNewMessages = mapped.filter((m: any) => !existingIds.has(m.id));
          
          if (uniqueNewMessages.length > 0) {
            // Prepend older messages to the beginning (they have earlier timestamps)
            const allMessages = [...uniqueNewMessages, ...(chat.messages || [])].sort((a, b) => a.ts - b.ts);
            
            // Update store
            useChatStore.setState((state) => ({
              chats: {
                ...state.chats,
                [chatId]: {
                  ...state.chats[chatId],
                  messages: allMessages,
                },
              },
            }));
            
            setTotalMessages(total);
            
            // Maintain scroll position: scroll to the previously first visible message
            if (firstVisibleMessageId && flatListRef.current) {
              requestAnimationFrame(() => {
                const newIndex = allMessages.findIndex((m: any) => m.id === firstVisibleMessageId);
                if (newIndex >= 0) {
                  try {
                    flatListRef.current?.scrollToIndex({
                      index: newIndex,
                      animated: false,
                      viewPosition: 0, // Keep it at the top of the viewport
                    });
                  } catch (e) {
                    // If scrollToIndex fails, try scrollToOffset as fallback
                    // Silently handle - don't log
                  }
                }
              });
            }
          }
        }
      } catch (error) {
        // Silently handle error - don't log to console
      } finally {
        setIsLoading(false);
      }
    },
    [chatId, chat?.personaId, chat?.messages, isLoading]
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasHydrated || !chatId) return;
      
      // Initialize totalMessages when chat first loads
      if (chat?.messages && chat.messages.length > 0 && totalMessages === 0) {
        // Estimate total messages based on current count (will be updated when pagination happens)
        // Or fetch the actual count - for now, set it to at least the current count
        setTotalMessages(chat.messages.length);
      }
      
      // Check if there's a pending response (last message is from user, no bot response yet)
      // This handles the case when user navigates away and comes back while waiting for response
      if (chat?.messages && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        // If last message is from user, assume response is pending (will be cleared when bot responds)
        // Only check if message is recent (within last 2 minutes) to avoid showing typing for old messages
        const messageAge = Date.now() - lastMessage.ts;
        if (lastMessage.role === "user" && messageAge < 120000) { // 2 minutes
          setIsTyping(true);
        } else {
          setIsTyping(false);
        }
      } else {
        setIsTyping(false);
      }
      
      // Mark as loaded after hydration
      if (hasHydrated && !hasLoadedInitial) {
        setHasLoadedInitial(true);
      }
    }, [hasHydrated, chatId, chat?.messages, totalMessages, hasLoadedInitial])
  );

  const data = React.useMemo(() => { 
      const messages = chat?.messages || [];
      // Messages are in chronological order (oldest to newest)
      // Without inverted, we display them as-is: oldest at top, newest at bottom
      
      const result = [
        ...messages, // Oldest to newest (top to bottom)
        ...(isTyping && displayPersona ? [{ id: "typing", role: "bot", typing: true, ts: Date.now() }] : []), // Typing at bottom
      ];

      if (hasLoadedInitial && displayPersona && messages.length === 0 && result.length === 0) {
        return [{
          id: String(Date.now()),
          role: "bot",
          text: displayPersona?.defaultMessage || `Hey! I'm ${displayPersona?.name || "AI"}. 👋 Lets chat!`,
          ts: Date.now(),
          typing: false,
        }];
      }

      return result;
  }, [chat?.messages, isTyping, displayPersona, hasLoadedInitial]);

  React.useEffect(() => { /* ... cleanup effect ... */ }, []);

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
        // Silently handle - don't log
        return;
      }
      setInput("");
      const id = Date.now().toString();
      setIsTyping(true);
      
      // Ensure we're at bottom before sending (user message will be added)
      setIsNearBottom(true);
      
      try {
        await sendUserMessage(chatId, text);
      } catch (error) {
        // Silently handle error - don't log to console
      } finally {
        setIsTyping(false);
      }

      setSeenMap((prev) => ({ ...prev, [id]: 1 }));
      setTimeout(() => setSeenMap((prev) => ({ ...prev, [id]: 2 })), 1000);
      setTimeout(() => setSeenMap((prev) => ({ ...prev, [id]: 3 })), 2000);
      
      // Scroll to bottom after user message is added
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (flatListRef.current) {
            try {
              flatListRef.current.scrollToEnd({ animated: true });
            } catch (e) {
              // Silently fail
            }
          }
        }, 100);
      });
  };

  const renderTicks = (msgId: string, role: string) => { 
      if (role !== "user") return null;
      const seenState = seenMap[msgId] || 1;
      const tickStyle = seenState === 3 ? [styles.tick, { color: "#7D4EFF" }] : styles.tick;
      
      if (seenState === 1) return <Text style={tickStyle}>✓</Text>;
      if (seenState === 2) return <Text style={tickStyle}>✓✓</Text>;
      if (seenState === 3) return <Text style={tickStyle}>✓✓</Text>;
      return null;
  };

  const renderItem = useCallback(
    ({ item, index }: any) => { 
        if (item.typing) {
          return <TypingIndicator />;
        }
        
        if (!item.text && !item.typing) {
          // Silently handle - don't log
          return null;
        }
        
        return <ChatBubble item={item} renderTicks={renderTicks} />;
    },
    [renderTicks]
  );

  const handleScrollToBottom = () => { 
      if (data.length > 0) {
        const lastIndex = data.length - 1;
        try {
          flatListRef.current?.scrollToIndex({ index: lastIndex, animated: true, viewPosition: 1 });
        } catch (e) {
          flatListRef.current?.scrollToEnd({ animated: true });
        }
        setIsNearBottom(true);
      }
  };

  const handleScroll = useCallback(
    (e: any) => { 
        const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
        const paddingToBottom = 100;
        // At bottom when scrolled to the end (contentOffset + layoutMeasurement ≈ contentSize)
        const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
        const atBottom = distanceFromBottom <= 5;
        const nearTop = contentOffset.y <= paddingToBottom;
        setIsNearBottom(atBottom);

        // Load more messages when scrolling to top (oldest messages)
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
        text: displayPersona.defaultMessage || `Hey! I'm ${displayPersona.name}. 👋 Lets chat!`,
        ts: Date.now(),
      };

      return <ChatBubble item={welcomeMessage} renderTicks={() => null} />;
  };

  return (
    // Main container flexes the children vertically
    <View style={styles.container}> 
      <FlatList
        ref={flatListRef}
        data={data}
        // Safer check for chat data
        extraData={`${data.length}-${chat ? chat.messages.length : 0}-${hasLoadedInitial}-${inputBottomMargin}`} 
        key={`flatlist-${chatId}`}
        style={styles.flatList}
        // FlatList content padding is constant
        contentContainerStyle={[
          styles.flatListContentContainer,
          // We apply the fixed input bar height as padding to ensure content stops above it when closed.
          { paddingBottom: INPUT_BAR_MIN_HEIGHT + insets.bottom + flatListContentPadding }
        ]}
        keyExtractor={(m, index) => {
          const key = String(m.id || `item-${index}`);
          if (!m.id) {
            // Silently handle - don't log
          }
          return key;
        }}
        renderItem={renderItem}
        initialNumToRender={50}
        maxToRenderPerBatch={20}
        windowSize={21}
        removeClippedSubviews={false}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        onContentSizeChange={(width, height) => {
          // Only auto-scroll to bottom if:
          // 1. We're near the bottom (user hasn't scrolled up)
          // 2. We're not currently loading older messages (pagination)
          // 3. This is for new messages at the bottom, not pagination at the top
          if (height > 0 && data.length > 0 && isNearBottom && !isLoading && flatListRef.current) {
            // Use a ref to track if we should scroll (prevent multiple scrolls)
            requestAnimationFrame(() => {
              setTimeout(() => {
                if (flatListRef.current && isNearBottom && !isLoading) {
                  try {
                    // Use scrollToEnd which is more reliable than scrollToIndex
                    flatListRef.current.scrollToEnd({ animated: false });
                  } catch (e) {
                    // Silently fail
                  }
                }
              }, 50); // Reduced timeout for faster response
            });
          }
        }}
        ListEmptyComponent={renderEmptyComponent}
        keyboardShouldPersistTaps="handled"
      />

      {/* Input bar is part of the Flex flow, its bottom margin is dynamic */}
      <SafeAreaView 
        edges={['bottom']} 
        style={[
            styles.inputWrapper, 
            { 
              // Set the fixed height of the *visible* input row
              minHeight: INPUT_BAR_MIN_HEIGHT,
              // APPLY DYNAMIC MARGIN BOTTOM HERE (Includes the buffer)
              marginBottom: inputBottomMargin 
            } 
        ]}
      >
        <View style={styles.inputContainer}>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="Type a message…"
              placeholderTextColor="#999"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
              multiline={false}
            />
            <Pressable style={styles.send} onPress={send}>
              <Text style={{ color: "#fff", fontWeight: "700" }}>Send</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Floating scroll button is ABSOLUTE */}
      {!isNearBottom && (
        <TouchableOpacity
          style={[
            styles.scrollButton, 
            // Position above the input bar + safe area + dynamic offset
            { bottom: INPUT_BAR_MIN_HEIGHT + insets.bottom + inputBottomMargin + 10 } 
          ]} 
          onPress={handleScrollToBottom}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={{ color: "#fff", fontWeight: "bold" }}>↓</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F4F2F8",
  },
  flatList: {
    flex: 1, // Takes up remaining space
  },
  flatListContentContainer: {
    padding: 12,
    flexGrow: 1,
    // The constant padding (12) is just the space between the last message and the input bar.
  },
  headerRow: { 
    flexDirection: "row", 
    alignItems: "center",
    flex: 1,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  headerName: { fontSize: 16, fontWeight: "600", color: "#fff" },

  bubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginVertical: 6,
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

  inputWrapper: {
    // No absolute positioning! Stays in the Flex flow.
    backgroundColor: "#1b0e24",
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingBottom: 0,
    zIndex: 100, 
  },
  inputContainer: {
    backgroundColor: "transparent",
    paddingBottom: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    color: "#222",
    fontSize: 15,
    maxHeight: 100,
  },
  send: {
    marginLeft: 8,
    backgroundColor: "#7D4EFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 60,
  },

  scrollButton: {
    position: 'absolute', // Scroll button must remain absolute
    right: 20,
    backgroundColor: "#7D4EFF",
    borderRadius: 24,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    zIndex: 999,
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