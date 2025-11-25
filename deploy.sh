#!/bin/bash

# AI Chat Backend Deployment Script
echo "🚀 Deploying AI Chat Backend Functions..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if project is linked
if [ ! -f ".git/config.toml" ] && [ ! -f "supabase/config.toml" ]; then
    echo "⚠️  Project not linked. Run:"
    echo "supabase link --project-ref <your-project-ref>"
    echo ""
    echo "Attempting to deploy anyway..."
fi

# Function to deploy a specific function
deploy_function() {
    local func_name=$1
    local func_display=$2
    echo "  📤 Deploying $func_display..."
    supabase functions deploy $func_name --no-verify-jwt
    if [ $? -eq 0 ]; then
        echo "  ✅ $func_display deployed"
    else
        echo "  ❌ Failed to deploy $func_display"
        return 1
    fi
}

# Function to deploy auth functions
deploy_auth() {
    echo "🔐 Deploying auth functions..."
    deploy_function "register" "register"
    deploy_function "reissue-api-key" "reissue-api-key"
}

# Function to deploy chat functions
deploy_chat() {
    echo "💬 Deploying chat functions..."
    deploy_function "chat-handler" "chat-handler"
    deploy_function "get_messages" "get_messages"
}

# Function to deploy persona functions
deploy_personas() {
    echo "🎭 Deploying persona functions..."
    deploy_function "get-personas" "get-personas"
    deploy_function "persona-manager" "persona-manager"
}

# Function to deploy notification functions
deploy_notifications() {
    echo "🔔 Deploying notification functions..."
    deploy_function "summarize-and-notify" "summarize-and-notify"
    deploy_function "thread-summarizer" "thread-summarizer"
}

# Function to deploy all
deploy_all() {
    echo "📦 Deploying all functions..."
    deploy_auth
    deploy_chat
    deploy_personas
    deploy_notifications
    echo ""
    echo "✅ All functions deployed successfully!"
}

# Show usage
show_usage() {
    echo ""
    echo "Usage: ./deploy.sh [OPTION]"
    echo ""
    echo "Options:"
    echo "  all                   Deploy all functions (default)"
    echo "  auth                  Deploy auth functions"
    echo "  chat                  Deploy chat functions"
    echo "  personas              Deploy persona functions"
    echo "  notifications         Deploy notification functions"
    echo ""
    echo "Individual functions:"
    echo "  register              Deploy register function"
    echo "  reissue-api-key       Deploy reissue-api-key function"
    echo "  chat-handler          Deploy chat-handler function"
    echo "  get_messages          Deploy get_messages function"
    echo "  get-personas          Deploy get-personas function"
    echo "  persona-manager       Deploy persona-manager function"
    echo "  summarize-and-notify  Deploy summarize-and-notify function"
    echo "  thread-summarizer     Deploy thread-summarizer function"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh                    # Deploy all"
    echo "  ./deploy.sh chat               # Deploy chat functions"
    echo "  ./deploy.sh persona-manager    # Deploy only persona-manager"
}

# Main logic
case "${1:-all}" in
    # Categories
    all)
        deploy_all
        ;;
    auth)
        deploy_auth
        ;;
    chat)
        deploy_chat
        ;;
    personas)
        deploy_personas
        ;;
    notifications)
        deploy_notifications
        ;;
    
    # Individual functions
    register)
        deploy_function "register" "register"
        ;;
    reissue-api-key)
        deploy_function "reissue-api-key" "reissue-api-key"
        ;;
    chat-handler)
        deploy_function "chat-handler" "chat-handler"
        ;;
    get_messages)
        deploy_function "get_messages" "get_messages"
        ;;
    get-personas)
        deploy_function "get-personas" "get-personas"
        ;;
    persona-manager)
        deploy_function "persona-manager" "persona-manager"
        ;;
    summarize-and-notify)
        deploy_function "summarize-and-notify" "summarize-and-notify"
        ;;
    thread-summarizer)
        deploy_function "thread-summarizer" "thread-summarizer"
        ;;
    
    # Help
    -h|--help|help)
        show_usage
        ;;
    
    *)
        echo "❌ Unknown option: $1"
        show_usage
        exit 1
        ;;
esac

echo ""
echo "🔗 Your functions are available at:"
echo "https://your-project-ref.supabase.co/functions/v1/"
