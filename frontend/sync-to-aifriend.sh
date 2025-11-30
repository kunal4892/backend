#!/bin/bash
# Script to sync frontend changes from backend repo to AIFriend repo
# Usage: ./sync-to-aifriend.sh

set -e

echo "🔄 Syncing frontend changes to AIFriend repo..."

# Make sure we're in the frontend directory
cd "$(dirname "$0")"

# Check if we have uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Error: You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Fetch latest from both remotes
echo "📥 Fetching latest changes..."
git fetch origin
git fetch aifriend

# Push to AIFriend repo
echo "📤 Pushing to AIFriend repo..."
git push aifriend main

echo "✅ Successfully synced to AIFriend repo!"
echo ""
echo "Current commit: $(git log --oneline -1)"

