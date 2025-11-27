import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  LayoutChangeEvent,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import useChatStore from "../store/useChatStore";
import { fetchPersonas } from "../lib/getPersonas";
import { usePersonas } from "../context/PersonaContext";

const NUM_COLUMNS = 2;
const GAP = 12;
const H_PADDING = 12;

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { loadChatFromServer } = useChatStore();
  const { width, height } = useWindowDimensions(); // ✅ Reactive dimensions

  const [personas, setFetchedPersonas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPersonaId, setLoadingPersonaId] = useState<string | null>(null);
  const [gridHeight, setGridHeight] = useState<number | null>(null);
  const { setPersonas } = usePersonas();

  // Calculate card width based on current window width
  const CARD_WIDTH = (width - H_PADDING * 2 - GAP) / NUM_COLUMNS;

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPersonas();
        setFetchedPersonas(data);
        setPersonas(data); // Also update the local personas state
      } catch (err: any) {
        console.error("❌ HomeScreen fetch error:", err?.message || err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Personas are now set directly in the fetch useEffect above

  useEffect(() => {
    AsyncStorage.getAllKeys().then(async (keys) => {
    });
  }, []);

  const openChat = async (personaId: string) => {
    try {
      setLoadingPersonaId(personaId);
      const start = Date.now();
      
      // Try to load existing chat first, if it fails, start a new chat
      let chatId: string;
      try {
        chatId = await loadChatFromServer(personaId);
      } catch (loadError: any) {
        // For new users, use startChat instead
        chatId = useChatStore.getState().startChat(personaId);
      }
      
      const elapsed = Date.now() - start;
      const minDelay = 1000;
      if (elapsed < minDelay) {
        await new Promise<void>((resolve) => setTimeout(resolve, minDelay - elapsed));
      }
      navigation.getParent()?.navigate("Chat", { chatId, personas: personas });
    } catch (err: any) {
      console.error("openChat: failed", { personaId, err: err?.message });
    } finally {
      setLoadingPersonaId(null);
    }
  };

  const onGridLayout = (e: LayoutChangeEvent) => {
    setGridHeight(e.nativeEvent.layout.height);
  };

  // Calculate card height to fill screen better - use available height
  // Account for header, safe area, and bottom navigation
  const headerHeight = 60; // Approximate header height
  const bottomNavHeight = 60; // Approximate bottom nav height
  const safeAreaTop = 40; // Safe area top
  const availableHeight = height - headerHeight - bottomNavHeight - safeAreaTop - (GAP * 3); // 3 gaps (between rows and padding)
  const calculatedHeightFromScreen = availableHeight / 2; // Divide by 2 for 2 rows
  
  // Use the larger of: calculated from screen or aspect ratio
  const cardAspectRatio = 0.55; // Taller cards
  const calculatedHeightFromAspect = CARD_WIDTH / cardAspectRatio;
  const CARD_HEIGHT = Math.max(calculatedHeightFromScreen, calculatedHeightFromAspect);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#1B0E24" }} edges={['top']}>
      <StatusBar backgroundColor="#2A1537" barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.logo}>AiSi</Text>
        </View>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#7D4EFF" />
            <Text style={{ color: "#fff", marginTop: 10 }}>Loading Personas…</Text>
          </View>
        ) : personas.length === 0 ? (
          <View style={styles.loader}>
            <Text style={{ color: "#fff" }}>No personas found.</Text>
          </View>
        ) : (
          <View style={styles.gridWrapper} onLayout={onGridLayout}>
            <FlatList
              key={`grid-${NUM_COLUMNS}`}
              data={personas}
              keyExtractor={(item) => String(item.id)}
              numColumns={NUM_COLUMNS}
              scrollEnabled={false}
              columnWrapperStyle={{
                justifyContent: "space-between",
                marginBottom: GAP,
              }}
              contentContainerStyle={{ 
                paddingHorizontal: H_PADDING,
                flexGrow: 1, // ✅ Allow content to grow and fill space
                justifyContent: "center", // ✅ Center content vertically if needed
              }}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.card,
                    { width: CARD_WIDTH, height: CARD_HEIGHT },
                  ]}
                >
                  <View style={styles.imageContainer}>
                    {item.image_url ? (
                      <Image source={{ uri: item.image_url }} style={styles.image} />
                    ) : (
                      <View style={[styles.image, styles.avatarFallback]}>
                        <Text style={styles.avatarLetter}>
                          {String(item.name || item.id || "?").charAt(0)}
                        </Text>
                      </View>
                    )}
                    {loadingPersonaId === item.id && (
                      <View style={styles.cardSpinner}>
                        <ActivityIndicator size="large" color="#7D4EFF" />
                      </View>
                    )}
                  </View>

                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.sub} numberOfLines={1} ellipsizeMode="tail">
                    {item.caption || item.short_summary || ""}
                  </Text>

                  <Pressable
                    style={[
                      styles.chatBtn,
                      loadingPersonaId === item.id && styles.chatBtnDisabled,
                    ]}
                    onPress={() => openChat(item.id)}
                    disabled={loadingPersonaId === item.id}
                  >
                    <Text style={styles.chatBtnText}>Chat</Text>
                  </Pressable>
                </View>
              )}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1B0E24" },
  header: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#2A1537" },
  logo: { fontSize: 22, fontWeight: "900", letterSpacing: 6, color: "#ffffff" },
  gridWrapper: { flex: 1 },
  loader: { flex: 1, backgroundColor: "#1B0E24", justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    flexDirection: "column", // ✅ Flex column layout
    justifyContent: "space-between", // ✅ Distribute children with space between
    paddingBottom: 4, // ✅ Small padding to prevent content from touching edges
  },
  imageContainer: { 
    position: "relative", 
    flex: 0.65, // ✅ Increased flex to give image more space
    minHeight: 120, // ✅ Increased minimum height
    overflow: "hidden" 
  },
  image: { width: "100%", height: "100%", resizeMode: "cover" },
  avatarFallback: { backgroundColor: "#4c1d95", justifyContent: "center", alignItems: "center" },
  avatarLetter: { color: "#fff", fontSize: 28, fontWeight: "800" },
  name: { 
    fontSize: 16, 
    fontWeight: "700", 
    color: "#111", 
    marginHorizontal: 10, 
    marginTop: 8, // ✅ Space after image
    marginBottom: 4, // ✅ Space before sub text
    flexShrink: 1,
    textAlign: "center", // ✅ Center the name
  },
  sub: { 
    color: "#444", 
    fontSize: 13, 
    marginHorizontal: 10, 
    marginBottom: 8, // ✅ Space before button
    flexShrink: 1,
    textAlign: "center", // ✅ Center the meta text
  },
  chatBtn: {
    backgroundColor: "#111",
    marginHorizontal: 10,
    marginBottom: 10, // ✅ Bottom margin
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    flexShrink: 0, // ✅ Prevent button from shrinking
    alignSelf: "stretch", // ✅ Full width within margins
  },
  chatBtnDisabled: { opacity: 0.5 },
  chatBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  cardSpinner: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  spinnerText: { fontSize: 12, color: "#7D4EFF", marginTop: 8, fontWeight: "600" },
});
