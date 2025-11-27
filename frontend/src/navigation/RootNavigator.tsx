// src/navigation/RootNavigator.tsx
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import useChatStore from "../store/useChatStore";

import LoginScreen from "../screens/LoginScreen";          // 🔹 original OTP login
import LoginScreenSimple from "../screens/LoginScreenSimple"; // 🔹 new simple login
import HomeScreen from "../screens/HomeScreen";
import ChatScreen from "../screens/ChatScreen";
import ChatsScreen from "../screens/ChatsScreen";
import { PersonaProvider } from "../context/PersonaContext";

export type RootStackParamList = {
  Login: undefined;
  MainTabs: undefined;
  Chat: { chatId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator();

const USE_SIMPLE_LOGIN = true;

// 🔹 Bottom tabs: Home + Chats
function MainTabs() {
  return (
    <PersonaProvider>
      <Tabs.Navigator screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="Home" component={HomeScreen} />
        <Tabs.Screen name="Chats" component={ChatsScreen} />
      </Tabs.Navigator>
    </PersonaProvider>
  );
}

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const app_key = await AsyncStorage.getItem("app_key");
        setInitialRoute(app_key ? "MainTabs" : "Login");
      } catch {
        setInitialRoute("Login");
      }
    })();
  }, []);

  useEffect(() => {
    // Will fire when hydration is done
    const unsub = (useChatStore as any).persist?.onFinishHydration?.(() => {
      useChatStore.setState({ hasHydrated: true });
    });

    // Trigger rehydrate explicitly (no-op if already hydrated)
    (useChatStore as any).persist?.rehydrate?.();

    return () => {
      unsub?.();
    };
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute}>
      {/* Login shown only on fresh install / no phone */}
      <Stack.Screen
        name="Login"
        component={USE_SIMPLE_LOGIN ? LoginScreenSimple : LoginScreen}
        options={{ headerShown: false }}
      />

      {/* Tabs hold Home + Chats */}
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />

      {/* Chat sits on top of the stack → always shows back arrow */}
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          title: "Chat", // 👈 title in header
          headerBackTitleVisible: false, // optional, cleaner back arrow
        }}
      />
    </Stack.Navigator>
  );
}
