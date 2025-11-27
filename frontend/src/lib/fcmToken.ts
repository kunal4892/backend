// Helper to get FCM token for device binding
import messaging from "@react-native-firebase/messaging";
import AsyncStorage from "@react-native-async-storage/async-storage";

let cachedFcmToken: string | null = null;

/**
 * Get FCM token for device binding
 * Caches the token to avoid repeated async calls
 */
export async function getFcmTokenForHeaders(): Promise<string | null> {
  try {
    // Check cache first
    if (cachedFcmToken) {
      return cachedFcmToken;
    }

    // Check AsyncStorage
    const storedToken = await AsyncStorage.getItem("fcm_token");
    if (storedToken) {
      cachedFcmToken = storedToken;
      return storedToken;
    }

    // Get from Firebase
    const token = await messaging().getToken();
    if (token) {
      // Cache it
      cachedFcmToken = token;
      await AsyncStorage.setItem("fcm_token", token);
      return token;
    }

    return null;
  } catch (error) {
    console.error("❌ Failed to get FCM token:", error);
    return null;
  }
}

/**
 * Clear cached FCM token (call this when token changes)
 */
export function clearFcmTokenCache() {
  cachedFcmToken = null;
}

