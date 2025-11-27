import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import useChatStore from "../store/useChatStore";
import { usePersonas } from "../context/PersonaContext";

export default function ChatsScreen({ route, navigation }: any) {
  const chats = useChatStore((s) => s.chats);
  const hydrated = useChatStore((s) => s.hasHydrated);
  const { personas } = usePersonas(); // ✅ directly shared from Home
  const [loadingPersonaId, setLoadingPersonaId] = useState<string | null>(null);

  // Remove this useEffect as it causes issues with items being used before declaration
  // useEffect(() => {
  //   console.log("🧩 ChatsScreen items:", items);
  // }, [items]);

//   useEffect(() => {
//     console.log("👀 Personas available in ChatsScreen:", personas);
//   }, [personas]);

  // ⏳ Show loader until AsyncStorage rehydrates
  if (!hydrated) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#D63384" />
        <Text style={styles.loadingText}>Loading your chats…</Text>
      </View>
    );
  }

  // ✅ Build enriched list of chats
  const items = useMemo(() => {
    const arr = Object.values(chats || {});
    return arr
      .map((c) => {
        const p =
          personas?.find((pp: any) => pp.id === c.personaId);
        const last = c.messages[c.messages.length - 1];
        const cleanLastText = (last?.text || "").replace(/\s*&&&\s*/g, " ").trim();
        return {
          id: c.id,
          personaId: c.personaId,
          name: p?.name ?? "Chat",
          image_url: p?.image_url ?? null,
          lastText: cleanLastText,
          lastTs: last?.ts ?? 0,
        };
      })
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [chats, personas]);

  const formatTime = (ts: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // ✅ Async loader before navigating into Chat
  const openChat = async (personaId: string) => {
    try {
      setLoadingPersonaId(personaId);
      
      // Try to load existing chat first, if it fails, start a new chat
      let chatId: string;
      try {
        chatId = await useChatStore.getState().loadChatFromServer(personaId);
      } catch (loadError: any) {
        // For new users, use startChat instead
        chatId = useChatStore.getState().startChat(personaId);
      }
      
      navigation.getParent()?.navigate("Chat", { chatId, personas });
    } catch (err: any) {
      console.error("❌ Failed to open chat:", { personaId, error: err?.message || err });
      Alert.alert("Error", "Could not load chat");
    } finally {
      setLoadingPersonaId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No conversations yet. Start one from Home 💬
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openChat(item.personaId)}
              style={styles.row}
              disabled={loadingPersonaId === item.personaId}
            >
              <View style={styles.avatarContainer}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.avatar}
                    resizeMode="cover"
                    onError={(e) =>
                      console.log("⚠️ Image load failed for:", item.name, item.image_url, e.nativeEvent)
                    }
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      {item.name?.[0] || "?"}
                    </Text>
                  </View>
                )}
                {loadingPersonaId === item.personaId && (
                  <View style={styles.avatarSpinner}>
                    <ActivityIndicator size="large" color="#7D4EFF" />
                  </View>
                )}
              </View>
              <View style={styles.texts}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.name}</Text>
                  <Text style={styles.time}>{formatTime(item.lastTs)}</Text>
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.lastText}
                </Text>
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // THEME
  container: { flex: 1, backgroundColor: "#1B0E24" },
  list: { padding: 12 },
  sep: { height: 10 },

  // ROW
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  // AVATAR
  avatarContainer: {
    position: "relative",
    marginRight: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    backgroundColor: "#7D4EFF",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarSpinner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },

  // TEXTS
  texts: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111" },
  time: { fontSize: 12, color: "#999", marginLeft: 8 },
  sub: { color: "#516173", fontSize: 14 },

  // EMPTY
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#f5e6ff", fontSize: 16 },

  // LOADING (hydration)
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B0E24",
  },
  loadingText: {
    marginTop: 12,
    color: "#f5e6ff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});