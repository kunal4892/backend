#!/bin/bash

# Start Android emulator - choose which one
# Usage: ./start-emulator.sh [emulator_name]

EMULATOR_NAME=${1:-"Medium_Phone_API_36.1"}

echo "🚀 Starting Android Emulator: $EMULATOR_NAME"
echo ""

# Check if already running
if adb devices | grep -q "device$"; then
    echo "⚠️  An emulator is already running!"
    echo "Current devices:"
    adb devices
    echo ""
    read -p "Kill existing emulator and start new one? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🛑 Stopping existing emulator..."
        adb emu kill 2>/dev/null
        pkill -f "qemu-system-aarch64" 2>/dev/null
        sleep 3
    else
        echo "Using existing emulator"
        exit 0
    fi
fi

# Start emulator
echo "📱 Starting $EMULATOR_NAME..."
$ANDROID_HOME/emulator/emulator -avd "$EMULATOR_NAME" > /dev/null 2>&1 &

EMULATOR_PID=$!
echo "Emulator starting (PID: $EMULATOR_PID)"
echo "⏳ Waiting for emulator to boot..."

# Wait for device
adb wait-for-device
echo "✅ Emulator is booting..."

# Wait a bit more for full boot
sleep 10

# Check if fully booted
while ! adb shell getprop sys.boot_completed | grep -q "1"; do
    echo "⏳ Still booting..."
    sleep 2
done

echo "✅ Emulator is ready!"
echo ""
echo "Device info:"
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
echo ""
echo "You can now run: npm run android"


