#!/bin/bash

# AI Chat Backend Deployment Script
echo "🚀 Deploying AI Chat Backend Functions..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase status &> /dev/null; then
    echo "❌ Not logged in to Supabase. Please run:"
    echo "supabase login"
    exit 1
fi

echo "📦 Deploying all functions..."

# Deploy authentication functions
echo "🔐 Deploying auth functions..."
supabase functions deploy register --no-verify-jwt
supabase functions deploy reissue-api-key --no-verify-jwt

# Deploy chat functions
echo "💬 Deploying chat functions..."
supabase functions deploy chat-handler --no-verify-jwt
supabase functions deploy get_messages --no-verify-jwt

# Deploy persona functions
echo "🎭 Deploying persona functions..."
supabase functions deploy get-personas --no-verify-jwt
supabase functions deploy persona-manager --no-verify-jwt

# Deploy notification functions
echo "🔔 Deploying notification functions..."
supabase functions deploy summarize-and-notify --no-verify-jwt
supabase functions deploy thread-summarizer --no-verify-jwt

echo "✅ All functions deployed successfully!"
echo ""
echo "📋 Deployed functions:"
echo "  - register (auth)"
echo "  - reissue-api-key (auth)"
echo "  - chat-handler (chat)"
echo "  - get_messages (chat)"
echo "  - get-personas (personas)"
echo "  - persona-manager (personas)"
echo "  - summarize-and-notify (notifications)"
echo "  - thread-summarizer (notifications)"
echo ""
echo "🔗 Your functions are available at:"
echo "https://your-project-ref.supabase.co/functions/v1/"
