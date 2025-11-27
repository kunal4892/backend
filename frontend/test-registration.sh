#!/bin/bash

# Quick test script for registration fix
# Usage: ./test-registration.sh [emulator_name]

set -e

EMULATOR_NAME=${1:-"Pixel_9_Pro_XL"}
FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🧪 Testing Samsung JSON Parse Error Fix"
echo "======================================"
echo ""

# Check if emulator is running
if ! adb devices | grep -q "device$"; then
    echo "📱 Starting emulator: $EMULATOR_NAME"
    $ANDROID_HOME/emulator/emulator -avd "$EMULATOR_NAME" > /dev/null 2>&1 &
    EMULATOR_PID=$!
    
    echo "⏳ Waiting for emulator to boot..."
    adb wait-for-device
    sleep 10  # Give it more time to fully boot
    echo "✅ Emulator is ready"
else
    echo "✅ Emulator is already running"
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
fi

# Build and install
echo ""
echo "🔨 Building and installing app..."
cd "$FRONTEND_DIR"
npm run android

# Wait a bit for app to install
sleep 5

echo ""
echo "📊 Monitoring logs (Ctrl+C to stop)..."
echo "Look for:"
echo "  - ✅ FRONTEND: Encryption successful"
echo "  - 📤 FRONTEND: Sending registration request"
echo "  - 📥 FRONTEND: Response received"
echo "  - ❌ Any error messages"
echo ""

# Monitor logs
adb logcat -c  # Clear logs
adb logcat | grep -E "FRONTEND|BACKEND|Register|Error|❌|✅|📤|📥" --color=never

# Cleanup on exit
trap "kill $EMULATOR_PID $METRO_PID 2>/dev/null" EXIT


