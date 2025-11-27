# Testing Samsung JSON Parse Error Fix

## Prerequisites
- Android emulator or physical device
- React Native development environment set up

## Step 1: Start an Android Emulator

You have these emulators available:
- `Medium_Phone_API_36.1`
- `Pixel_3`
- `Pixel_9_Pro_XL`

Start one with:
```bash
cd frontend
$ANDROID_HOME/emulator/emulator -avd Pixel_9_Pro_XL &
```

Or use Android Studio to start an emulator.

## Step 2: Build and Run the App

```bash
cd frontend
npm install  # or yarn install
npm run android
```

Or manually:
```bash
cd frontend/android
./gradlew clean
cd ..
npm start  # In one terminal
npm run android  # In another terminal
```

## Step 3: Test the Registration Flow

1. Open the app on the emulator
2. Navigate to the registration screen (LoginScreenSimple)
3. Enter a 10-digit phone number (e.g., `1234567890`)
4. Tap "Register"
5. **Check the logs** to see if:
   - The request is sent properly
   - The response is handled correctly
   - Any errors are caught and displayed as user-friendly messages

## Step 4: View Logs

### React Native Logs
```bash
# In the frontend directory
npx react-native log-android
```

### Backend Logs (Supabase)
Check your Supabase dashboard → Edge Functions → register → Logs

## Step 5: Test Error Scenarios

### Test 1: Malformed Request (Backend Fix)
To test if the backend properly handles malformed requests:

1. Use a network interceptor (like Charles Proxy or mitmproxy)
2. Modify the request body to be invalid JSON
3. Verify the backend returns JSON error, not HTML

### Test 2: Network Issues (Frontend Fix)
1. Disable network on emulator: Settings → Network → Airplane mode
2. Try to register
3. Should see a proper error message, not "Unexpected character: I"

### Test 3: Server Error (Full Fix)
1. Temporarily break the backend (e.g., remove ACCESS_KEY env var)
2. Try to register
3. Should see JSON error response, not HTML

## What to Look For

### ✅ Success Indicators:
- Registration works normally
- Errors show user-friendly messages
- No "JSON Parse error: Unexpected character: I"
- Logs show proper error handling

### ❌ Failure Indicators:
- "JSON Parse error: Unexpected character: I" still appears
- App crashes on registration
- HTML error pages instead of JSON

## Debugging Tips

1. **Check console logs** in Metro bundler terminal
2. **Check Android logs**: `adb logcat | grep -i "frontend\|backend\|register"`
3. **Check network requests**: Use React Native Debugger or Flipper
4. **Verify network security config**: Check if `network_security_config.xml` is included in APK

## Simulating Samsung-Specific Issues

To simulate the Samsung issue on an emulator:

1. Use a device with Android 14 (API 34+)
2. Enable "Secure Wi-Fi" or VPN (if available on emulator)
3. Test with network interceptors enabled
4. Test with different network conditions (slow 3G, etc.)

## Quick Test Script

Run this to quickly test registration:

```bash
# Start emulator (if not running)
$ANDROID_HOME/emulator/emulator -avd Pixel_9_Pro_XL &

# Wait for emulator to boot
adb wait-for-device

# Install and run
cd frontend
npm run android

# Watch logs
adb logcat | grep -E "FRONTEND|BACKEND|Register|Error"
```


