#!/bin/bash

# Monitor logs for registration testing
# Run this and then try registering in the app

echo "📊 Monitoring Android logs..."
echo "Try registering in the app now!"
echo "Press Ctrl+C to stop"
echo ""

adb logcat -c
adb logcat | grep -E "FRONTEND|BACKEND|Register|Error|❌|✅|📤|📥|Unexpected|JSON|Parse|encrypt|Encryption" --color=always


