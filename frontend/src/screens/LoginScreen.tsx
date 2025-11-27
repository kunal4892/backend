// src/screens/LoginScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Button, StyleSheet, Alert, Image } from "react-native";
import auth from "@react-native-firebase/auth";
import { Picker } from "@react-native-picker/picker";
import { useNavigation } from "@react-navigation/native";
import { INDIAN_CITIES } from "../constants/indianCities";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [phone, setPhone] = useState("7568937557");
  const [otp, setOtp] = useState("");
  const [confirm, setConfirm] = useState<any>(null);

  const [age, setAge] = useState("18");
  const [gender, setGender] = useState("Male");
  const [city, setCity] = useState("Delhi");

  const sendOtp = async () => {
    if (!phone) return Alert.alert("Enter phone number");
    try {
      const confirmation = await auth().signInWithPhoneNumber("+91" + phone);
      setConfirm(confirmation);
      Alert.alert("OTP sent to " + phone);
    } catch (err) {
      console.error("OTP error:", err);
      Alert.alert("Error sending OTP");
    }
  };

  const verifyOtp = async () => {
    if (!confirm) return Alert.alert("Send OTP first");
    try {
      await confirm.confirm(otp);

      const BEARER_TOKEN =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lbmRyaXdhZHdqenR4cWN6cWxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxOTc5OTAsImV4cCI6MjA3Mjc3Mzk5MH0.yhATNst6nnbTTGxHQzr7hoJk0PFVasSChZ-f74W8be0";

      const res = await fetch(
        "https://oendriwadwjztxqczqlp.supabase.co/functions/v1/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${BEARER_TOKEN}`,
          },
          body: JSON.stringify({ phone, gender, age: parseInt(age, 10), location: city }),
        }
      );

      // Check if response is ok
      if (!res.ok) {
        // Try to get error message from response
        let errorMessage = `Server error: ${res.status} ${res.statusText}`;
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            errorMessage = errorData?.error || errorMessage;
          } else {
            // If not JSON, read as text to see what we got
            const textResponse = await res.text();
            console.error("❌ Non-JSON error response:", textResponse);
            errorMessage = `Server error: ${res.status}. ${textResponse.substring(0, 100)}`;
          }
        } catch (parseError) {
          console.error("❌ Failed to parse error response:", parseError);
        }
        throw new Error(errorMessage);
      }

      // Check content type before parsing JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await res.text();
        console.error("❌ Expected JSON but got:", contentType, textResponse.substring(0, 100));
        throw new Error(`Invalid response format. Expected JSON but got ${contentType || "unknown"}`);
      }

      const data = await res.json();
      if (data.success) {
        await AsyncStorage.setItem("phone", data?.user?.phone || phone);
        // You can keep userId if you want, but phone is the key everywhere now
        await AsyncStorage.setItem("userId", data?.user?.id || "");
        await AsyncStorage.setItem("userData", JSON.stringify(data.user));
        navigation.reset({ index: 0, routes: [{ name: "MainTabs" }] });
      } else {
        Alert.alert("Registration failed", data?.error || "Unknown error");
      }
    } catch (err) {
      console.error("Verify error:", err);
      Alert.alert("Invalid OTP");
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require("../../assets/register.jpeg")} style={styles.headerImage} />
      <Text style={styles.title}>Register</Text>

      <Text>Phone Number</Text>
      <TextInput
        style={styles.input}
        placeholder="10-digit phone"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <Button title="Send OTP" onPress={sendOtp} />

      {confirm && (
        <>
          <Text>Enter OTP</Text>
          <TextInput style={styles.input} keyboardType="number-pad" value={otp} onChangeText={setOtp} />
          <Button title="Verify OTP" onPress={verifyOtp} />
        </>
      )}

      <Text>Age</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter age"
        keyboardType="number-pad"
        value={age}
        onChangeText={setAge}
      />

      <Text>Gender</Text>
      <Picker selectedValue={gender} onValueChange={setGender} style={styles.picker}>
        <Picker.Item label="Male" value="Male" />
        <Picker.Item label="Female" value="Female" />
        <Picker.Item label="Other" value="Other" />
      </Picker>

      <Text>City</Text>
      <Picker selectedValue={city} onValueChange={setCity} style={styles.picker}>
        {INDIAN_CITIES.map((c) => (
          <Picker.Item key={c} label={c} value={c} />
        ))}
      </Picker>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: "#1B0E24", padding: 20, justifyContent: "center" },
  headerImage: { width: "100%", height: 180, resizeMode: "contain", marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "800", textAlign: "center", color: "#fff", marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: "center", color: "#f5e6ff", marginBottom: 20 },
  input: {
    backgroundColor: "#2A1537",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#4C2A62",
  },
  picker: { backgroundColor: "#2A1537", color: "#fff", marginBottom: 12, borderRadius: 10 },
  button: {
    backgroundColor: "#D63384",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
