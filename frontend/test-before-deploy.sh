#!/bin/bash

# Test script to reproduce the original error before deploying fixes
# This will help verify the fix works

set -e

EMULATOR_NAME=${1:-"Pixel_9_Pro_XL"}
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing BEFORE backend fix deployment"
echo "=========================================="
echo ""
echo "⚠️  This test uses the CURRENT deployed backend (without fixes)"
echo "   Frontend has improved error handling, so errors will be clearer"
echo ""

# Check if emulator is running
if ! adb devices | grep -q "device$"; then
    echo "📱 Starting emulator: $EMULATOR_NAME"
    $ANDROID_HOME/emulator/emulator -avd "$EMULATOR_NAME" > /dev/null 2>&1 &
    EMULATOR_PID=$!
    
    echo "⏳ Waiting for emulator to boot..."
    adb wait-for-device
    sleep 10
    echo "✅ Emulator is ready"
else
    echo "✅ Emulator is already running"
    EMULATOR_PID=""
fi

# Check if Metro is running
if ! lsof -ti:8081 > /dev/null 2>&1; then
    echo "🚀 Starting Metro bundler..."
    cd "$FRONTEND_DIR"
    npm start > /dev/null 2>&1 &
    METRO_PID=$!
    sleep 5
    echo "✅ Metro bundler started"
else
    echo "✅ Metro bundler is already running"
    METRO_PID=""
fi

# Build and install
echo ""
echo "🔨 Building and installing app..."
cd "$FRONTEND_DIR"
npm run android

# Wait for app to install
sleep 5

echo ""
echo "📊 Monitoring logs..."
echo ""
echo "🔍 What to look for:"
echo "   - If you see 'Unexpected character: I' → Original error reproduced ✅"
echo "   - If you see better error messages → Frontend fix is working ✅"
echo "   - If registration works → No error (good!) ✅"
echo ""
echo "📱 Now try to register in the app with a phone number"
echo ""

# Monitor logs with better filtering
adb logcat -c
adb logcat | grep -E "FRONTEND|BACKEND|Register|Error|❌|✅|📤|📥|Unexpected|JSON|Parse" --color=always

# Cleanup
if [ ! -z "$EMULATOR_PID" ]; then
    trap "kill $EMULATOR_PID 2>/dev/null" EXIT
fi
if [ ! -z "$METRO_PID" ]; then
    trap "kill $METRO_PID 2>/dev/null" EXIT
fi


