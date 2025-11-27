// App.tsx
import React, { useEffect } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { enableScreens } from "react-native-screens";
import { Alert, Platform, PermissionsAndroid } from "react-native";
import messaging from "@react-native-firebase/messaging";
import RootNavigator from "./src/navigation/RootNavigator";
import useChatStore from "./src/store/useChatStore";

// Enable react-native-screens for performance
enableScreens();

// Define navigation types for type safety
type RootStackParamList = {
  Chat: { chatId: string };
  // Add other routes as needed
};

// Create global navigation ref with types
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Request FCM permissions based on platform
async function requestFCMPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === "ios") {
      // iOS: Request permission via FCM
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      // console.log("🔑 iOS FCM Permission:", authStatus); // Commented out for production
      return enabled;
    } else if (Platform.OS === "android" && Platform.Version >= 33) {
      // Android 13+: Request POST_NOTIFICATIONS permission
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      // console.log("🔑 Android POST_NOTIFICATIONS:", granted); // Commented out for production
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    // Android < 13: Permissions auto-granted
    return true;
  } catch (error) {
    console.error("Error requesting FCM permissions:", error);
    return false;
  }
}

// Save FCM token to Supabase (placeholder)
async function saveFCMTokenToSupabase(token: string) {
  // TODO: Implement Supabase edge function to upsert { phone, fcm_token }
  // Example: await supabase.from('users').upsert({ phone, fcm_token: token });
  console.log("Saving FCM token to Supabase:", token);
}

// Setup FCM notification handlers
function setupNotificationHandlers() {
  // Foreground message handler
  messaging().onMessage(async (remoteMessage) => {
    // console.log("📩 Foreground:", remoteMessage); // Commented out for production
    // Handle foreground notification (e.g., show in-app alert)
  });

  // Notification opened when app is in background
  messaging().onNotificationOpenedApp((remoteMessage) => {
    const personaId = remoteMessage.data?.personaId;
    if (personaId && navigationRef.isReady()) {
      // console.log("onNotificationOpenedApp", "Person ID:", personaId); // Commented out for production
      const chatId = useChatStore.getState().startChat(personaId);
      navigationRef.navigate("Chat", { chatId });
    }
  });

  // Notification opened when app is killed
  messaging()
    .getInitialNotification()
    .then((remoteMessage) => {
      const personaId = remoteMessage?.data?.personaId;
      if (personaId && navigationRef.isReady()) {
        // console.log("getInitialNotification", "Person ID:", personaId, "Chat ID:", `chat_${personaId}`); // Commented out for production
        const chatId = useChatStore.getState().startChat(personaId);
        navigationRef.navigate("Chat", { chatId });
      }
    });
}

export default function App() {
  useEffect(() => {
    const initializeFCM = async () => {
      const granted = await requestFCMPermissions();
      if (granted) {
        try {
          const token = await messaging().getToken();
          // console.log("✅ Device FCM Token:", token); // Commented out for production
          await saveFCMTokenToSupabase(token);
        } catch (error) {
          console.error("Error fetching FCM token:", error);
        }
      } else {
        // Show user-facing alert for permission denial
        Alert.alert(
          "Permission Denied",
          "Push notifications are disabled. Please enable them in your device settings to receive updates.",
          [{ text: "OK" }]
        );
      }
      setupNotificationHandlers();
    };

    initializeFCM();
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <RootNavigator />
    </NavigationContainer>
  );
}