// src/components/ChatLoader.tsx
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";

// 👩‍🎨 Floating emojis while loading
const emojis = ["💬", "❤️", "😉", "😅"];

export default function ChatLoader() {

    useEffect(() => {
      const anim = Animated.loop( /* your animation */ );
      anim.start();

      return () => {
        anim.stop(); // 🛑 cleanup
      };
    }, []);

  return (
    <View style={styles.container}>
      {emojis.map((emoji, idx) => (
        <FloatingEmoji key={idx} emoji={emoji} delay={idx * 300} />
      ))}

      {/* ✅ Typing indicator inside a bubble */}
      <ChatBubble>
        <TypingIndicator />
      </ChatBubble>

      <Text style={styles.text}>Loading your chat...</Text>
    </View>
  );
}

// 👇 Floating emoji animation
function FloatingEmoji({ emoji, delay }: { emoji: string; delay: number }) {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -30,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 30,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      ])
    ).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.Text
      style={[
        styles.emoji,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

// 👇 Typing indicator (3 bouncing dots)
function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      {[0, 1, 2].map((i) => (
        <BounceDot key={i} delay={i * 150} />
      ))}
    </View>
  );
}

function BounceDot({ delay }: { delay: number }) {
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(scale, {
          toValue: 1.2,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.5,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [delay, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// 👇 Chat bubble wrapper
function ChatBubble({ children }: { children: React.ReactNode }) {
  return <View style={styles.bubble}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1B0E24",
  },
  emoji: {
    fontSize: 28,
    position: "absolute",
  },
  text: {
    position: "absolute",
    bottom: 60,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  bubble: {
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 100,
    flexDirection: "row",
    alignItems: "center",
  },
  typingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#555",
    marginHorizontal: 3,
  },
});

export { TypingIndicator };