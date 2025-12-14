// src/screens/LoginScreenSimple.tsx
import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  StatusBar,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import messaging from "@react-native-firebase/messaging";
// @ts-ignore
import CryptoJS from "react-native-crypto-js";
// @ts-ignore
import forge from "node-forge";
import { Buffer } from "buffer";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../lib/httpClient";

const { width } = Dimensions.get("window");

export default function LoginScreenSimple() {
  const navigation = useNavigation<any>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  // Validate phone number (exactly 10 digits)
  const isValidPhone = phone.length === 10 && /^\d+$/.test(phone);

  const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqKDGpW//WSEdi8Z61Bm6
Inm6q93lWg5Guo50W3cxnH8xnDpqqsASwHFUKVkkDQoQ673CuwDDXtpK+Z7rW7l2
U4hV5Z1QrGgci7lO3Z8Uft7QlG5ICIvDi0LO94ni0IlfpVHt4RG5RcnjE3nHJETw
elp3EhiYTVB54PSZoqgQWh9OXYHFz3QBI/t6FPLSepSpdh3zc4xBTOXzIcPwy4lS
kGUjHvhXpxDmnouBI2SgzkW6OnytZwuqrfGOms4xodFRyjAreHUZgaoCet83MpqV
/bLYQhqKjjgwWZJMGIY1ddxB8DFRR8lg/m2OTlB8wGkCawwz1lOy2AmvEwNEvVXb
pwIDAQAB
-----END PUBLIC KEY-----`;

  const getFcmToken = async () => {
    try {
      const authStatus = await messaging().requestPermission();
      
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!enabled) {
        return null;
      }
      
      const token = await messaging().getToken();
      return token;
    } catch (err: any) {
      console.error("❌ [FCM] Token error:", err);
      console.error("❌ [FCM] Error code:", err?.code);
      console.error("❌ [FCM] Error message:", err?.message);
      console.error("❌ [FCM] Error stack:", err?.stack);
      return null;
    }
  };

  // NOTE: fetchWithAuth is now imported from authHttpClient.ts
  // No need to define it here anymore

  function rsaEncryptOAEP_SHA256_RAW(rawBytes: string, publicPem: string) {
    const pub = forge.pki.publicKeyFromPem(publicPem);
    const encryptedBytes = pub.encrypt(rawBytes, "RSA-OAEP", {
      md: forge.md.sha256.create(),
      mgf1: forge.mgf.mgf1.create(forge.md.sha256.create()),
    });
    return forge.util.encode64(encryptedBytes);
  }

  const encryptPayload = async (obj: any) => {
    try {
      const plaintext = JSON.stringify(obj);

      if (!plaintext) throw new Error("Payload empty");

      // Generate AES key and IV with error handling for Samsung devices
      let aesKeyRaw: string;
      let ivRaw: string;
      try {
        aesKeyRaw = forge.random.getBytesSync(32);
        ivRaw = forge.random.getBytesSync(16);
      } catch (randomError: any) {
        console.error("❌ FRONTEND: Random generation failed (possible Samsung/Android 14 issue):", randomError);
        throw new Error(`Failed to generate random keys: ${randomError.message}. This may be a device compatibility issue.`);
      }

      const aesKeyHex = Buffer.from(aesKeyRaw, "binary").toString("hex");
      const ivHex = Buffer.from(ivRaw, "binary").toString("hex");
      
      // Ensure we have valid values before encryption
      if (!aesKeyHex || !ivHex || aesKeyHex.length !== 64 || ivHex.length !== 32) {
        console.error("❌ FRONTEND: Invalid key/IV generated:", { 
          aesKeyLength: aesKeyHex?.length, 
          ivLength: ivHex?.length 
        });
        throw new Error("Failed to generate valid encryption keys");
      }

      let cipherBase64: string;
      try {
      const cipher = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Hex.parse(aesKeyHex), {
        iv: CryptoJS.enc.Hex.parse(ivHex),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
        cipherBase64 = cipher.toString();
      } catch (aesError: any) {
        console.error("❌ FRONTEND: AES encryption failed:", aesError);
        throw new Error(`AES encryption failed: ${aesError.message}. This may be a device compatibility issue.`);
      }
      
      if (!cipherBase64 || cipherBase64.length === 0) {
        throw new Error("AES encryption returned empty result");
      }

      let encryptedKeyBase64: string;
      try {
        encryptedKeyBase64 = rsaEncryptOAEP_SHA256_RAW(aesKeyRaw, PUBLIC_KEY);
      } catch (rsaError: any) {
        console.error("❌ FRONTEND: RSA encryption failed:", rsaError);
        throw new Error(`RSA encryption failed: ${rsaError.message}. This may be a device compatibility issue.`);
      }
      
      if (!encryptedKeyBase64 || encryptedKeyBase64.length === 0) {
        throw new Error("RSA encryption returned empty result");
      }

      // Validate all required fields
      if (!encryptedKeyBase64 || !ivHex || !cipherBase64) {
        throw new Error("Missing encrypted_key, iv, or payload");
      }

      const body = {
        encrypted_key: encryptedKeyBase64,
        iv: ivHex,
        payload: cipherBase64,
      };

      // Final validation
      if (!body.encrypted_key || !body.iv || !body.payload) {
        throw new Error("Missing encrypted_key, iv, or payload in final body");
      }

      console.log("✅ FRONTEND: Encryption successful", {
        encryptedKeyLength: encryptedKeyBase64.length,
        ivLength: ivHex.length,
        payloadLength: cipherBase64.length
      });

      return body;
    } catch (err: any) {
      console.error("❌ FRONTEND: encryptPayload error:", err);
      console.error("❌ FRONTEND: Error stack:", err?.stack);
      throw err;
    }
  };

  const registerUser = async () => {
    if (!isValidPhone) return Alert.alert("Please enter a valid 10-digit phone number");
    setLoading(true);
    try {
      const fcmToken = await getFcmToken();
      const payloadObj = { phone, fcm_token: fcmToken };
      
      let body;
      try {
        body = await encryptPayload(payloadObj);
      } catch (encryptError) {
        console.error("❌ Encryption failed:", encryptError);
        // If encryption fails, we need to fix the AES library linking
        // For now, show error to user about encryption issue
        Alert.alert(
          "Encryption Error", 
          "Unable to encrypt data. Please check if the app is properly built with encryption libraries.",
          [
            { text: "Retry", onPress: () => registerUser() },
            { text: "Cancel", style: "cancel" }
          ]
        );
        setLoading(false);
        return;
      }

      const jsonBody = JSON.stringify(body);

      console.log("📤 FRONTEND: Sending registration request to:", `${SUPABASE_URL}/register`);
      console.log("📤 FRONTEND: Request body size:", jsonBody.length, "bytes");

      const res = await fetch(`${SUPABASE_URL}/register`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: jsonBody,
      });

      console.log("📥 FRONTEND: Response received:", {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get("content-type"),
        ok: res.ok
      });

      // Read response as text first (we can only read once)
      const responseText = await res.text();
      console.log("📥 FRONTEND: Response text preview (first 200 chars):", responseText.substring(0, 200));

      // Check if response is ok
      if (!res.ok) {
        // Try to get error message from response
        let errorMessage = `Server error: ${res.status} ${res.statusText}`;
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData?.error || errorMessage;
          } else {
            // If not JSON, use the text response we already read
            console.error("❌ Non-JSON error response (first 200 chars):", responseText.substring(0, 200));
            // Check if it's a Samsung/network security related error
            if (responseText.includes("Internal Server Error") || responseText.trim().startsWith("I")) {
              errorMessage = `Server error: ${res.status}. The server may be experiencing issues. Please try again.`;
            } else {
              errorMessage = `Server error: ${res.status}. ${responseText.substring(0, 100)}`;
            }
          }
        } catch (parseError: any) {
          console.error("❌ Failed to parse error response:", parseError);
          console.error("❌ Parse error details:", parseError.message);
          // If parsing fails, use the raw text
          if (responseText.trim().startsWith("I")) {
            errorMessage = `Server error: ${res.status}. Received unexpected response format. This may be a network or device-specific issue.`;
          }
        }
        throw new Error(errorMessage);
      }

      // Check content type before parsing JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error("❌ Expected JSON but got:", contentType);
        console.error("❌ Response preview (first 200 chars):", responseText.substring(0, 200));
        
        // Samsung-specific: Check if response starts with "I" (Internal Server Error or similar)
        if (responseText.trim().startsWith("I")) {
          throw new Error("Server returned an error page instead of JSON. This may be a network or server issue. Please try again.");
        }
        
        throw new Error(`Invalid response format. Expected JSON but got ${contentType || "unknown"}`);
      }

      // Parse JSON from the text we already read
      let data;
      try {
        data = JSON.parse(responseText);
        console.log("✅ FRONTEND: Successfully parsed JSON response");
      } catch (jsonError: any) {
        console.error("❌ FRONTEND: JSON parse error:", jsonError);
        console.error("❌ FRONTEND: JSON error message:", jsonError.message);
        console.error("❌ FRONTEND: Raw response (first 200 chars):", responseText.substring(0, 200));
        // Check if it's the "Unexpected character: I" error
        if (jsonError.message && jsonError.message.includes("Unexpected character")) {
          throw new Error(`Server returned invalid JSON (${jsonError.message}). This may be a device-specific network issue. Please check your connection and try again.`);
        }
        throw new Error(`Failed to parse server response as JSON: ${jsonError.message}. This may be a device-specific issue.`);
      }

      console.log("\n=== FRONTEND: REGISTER RESPONSE ANALYSIS ===");
      console.log("📥 FRONTEND: Response data keys:", Object.keys(data || {}));
      console.log("📥 FRONTEND: Response data:", JSON.stringify(data, null, 2));
      console.log("📥 FRONTEND: Has app_key:", !!data?.app_key);
      console.log("📥 FRONTEND: Has success:", !!data?.success);
      console.log("📥 FRONTEND: Has phone:", !!data?.phone);
      console.log("📥 FRONTEND: Phone from response:", data?.phone);
      console.log("📥 FRONTEND: Phone from local state:", phone);
      console.log("📥 FRONTEND: Has error:", !!data?.error);
      console.log("📥 FRONTEND: app_key type:", typeof data?.app_key);
      console.log("📥 FRONTEND: app_key length:", data?.app_key?.length || 0);
      console.log("📥 FRONTEND: app_key preview:", data?.app_key ? `${data.app_key.substring(0, 50)}...` : "MISSING");

      if (data?.app_key) {
        console.log("✅ FRONTEND: app_key found, saving to AsyncStorage");
        // Save token - use phone from response if available, otherwise fallback to local state
        const phoneToSave = data?.phone || phone;
        console.log("📥 FRONTEND: Phone to save:", phoneToSave);
        console.log("📥 FRONTEND: Phone source:", data?.phone ? "from response" : "from local state");
        
        await AsyncStorage.setItem("app_key", data.app_key);
        await AsyncStorage.setItem("phone", phoneToSave);
        console.log("✅ FRONTEND: Saved app_key and phone to AsyncStorage");
        
        // Verify what was saved
        const savedToken = await AsyncStorage.getItem("app_key");
        const savedPhone = await AsyncStorage.getItem("phone");
        console.log("✅ FRONTEND: Verification - saved token exists:", !!savedToken);
        console.log("✅ FRONTEND: Verification - saved token length:", savedToken?.length || 0);
        console.log("✅ FRONTEND: Verification - saved phone:", savedPhone);
        console.log("✅ FRONTEND: Verification - phone matches:", savedPhone === phoneToSave);
        
        console.log("✅ FRONTEND: Navigating to MainTabs");
        navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
      } else {
        console.error("❌ FRONTEND: app_key missing from response!");
        console.error("❌ FRONTEND: Response data:", JSON.stringify(data, null, 2));
        Alert.alert("Registration failed", data?.error || "Unknown error");
      }
    } catch (err: any) {
      console.error("❌ FRONTEND: Register error:", err);
      Alert.alert("Error registering user", err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {/* Back button */}
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>


          {/* App Logo - AiSi with actual image */}
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              <Image 
                source={require("../../assets/register.jpeg")} 
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* Phone Input Field */}
          <View style={styles.inputContainer}>
            <View style={styles.phoneInputWrapper}>
              <Text style={styles.countryCode}>+91</Text>
              <View style={styles.separator} />
              <TextInput
                style={styles.phoneInput}
                placeholder="Enter Phone Number"
                placeholderTextColor="#8E8E8E"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={10}
                autoFocus
              />
            </View>
          </View>

          {/* Register Button */}
          <TouchableOpacity
            style={[
              styles.registerButton,
              !isValidPhone && styles.registerButtonDisabled
            ]}
            onPress={registerUser}
            disabled={!isValidPhone || loading}
          >
            <Text style={[
              styles.registerButtonText,
              !isValidPhone && styles.registerButtonTextDisabled
            ]}>
              {loading ? "Please wait..." : "Register"}
            </Text>
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    marginTop: 10,
    marginBottom: 20,
    alignSelf: "flex-start",
  },
  backArrow: {
    fontSize: 24,
    color: "#000000",
    fontWeight: "600",
  },
  logoContainer: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 60,
  },
  logoWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
  },
  logoImage: {
    width: "100%",
    height: "100%",
  },
  inputContainer: {
    marginBottom: 20,
  },
  phoneInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#E1E1E1",
    borderRadius: 8,
    height: 50,
    paddingHorizontal: 12,
  },
  countryCode: {
    fontSize: 16,
    color: "#000000",
    fontWeight: "500",
    marginRight: 8,
  },
  separator: {
    width: 1,
    height: 20,
    backgroundColor: "#E1E1E1",
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: "#000000",
    paddingVertical: 0,
  },
  registerButton: {
    backgroundColor: "#E1306C",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  registerButtonDisabled: {
    backgroundColor: "#E1E1E1",
  },
  registerButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  registerButtonTextDisabled: {
    color: "#8E8E8E",
  },
});