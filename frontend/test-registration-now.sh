#!/bin/bash

# Quick test script for registration on currently running emulator
# This will test the Samsung JSON parse error fix

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing Registration Fix on Android Emulator"
echo "================================================"
echo ""
echo "📱 Emulator: $(adb shell getprop ro.product.model)"
echo "🤖 Android: $(adb shell getprop ro.build.version.release) (API $(adb shell getprop ro.build.version.sdk))"
echo ""

# Check if app is installed
if ! adb shell pm list packages | grep -q "com.aisiappcompanion"; then
    echo "📦 App not installed. Building and installing..."
    cd "$FRONTEND_DIR"
    npm run android
    sleep 5
else
    echo "✅ App is already installed"
fi

echo ""
echo "📊 Starting log monitoring..."
echo ""
echo "🔍 What to look for when you register:"
echo "   ✅ FRONTEND: Encryption successful"
echo "   📤 FRONTEND: Sending registration request"
echo "   📥 FRONTEND: Response received"
echo "   ❌ Any error messages (should be clear, not 'Unexpected character: I')"
echo ""
echo "📱 Instructions:"
echo "   1. Open the app on the emulator"
echo "   2. Navigate to registration screen"
echo "   3. Enter a 10-digit phone number"
echo "   4. Tap 'Register'"
echo "   5. Watch the logs below for what happens"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo ""

# Clear logs and start monitoring
adb logcat -c
adb logcat | grep -E "FRONTEND|BACKEND|Register|Error|❌|✅|📤|📥|Unexpected|JSON|Parse|encrypt|Encryption" --color=always


