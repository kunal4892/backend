# AI Chat App Backend

A comprehensive Supabase Edge Functions backend for an AI-powered chat application with multiple personas, real-time messaging, and push notifications.

## 🚀 Features

- **Multi-Persona AI Chat**: Different AI characters with unique personalities
- **Encrypted Registration**: Secure user registration with RSA + AES encryption
- **JWT Authentication**: Secure API access with token-based auth
- **Real-time Messaging**: Fast responses using Gemini 2.5 Flash
- **Push Notifications**: FCM integration with personalized teasers
- **Thread Management**: Conversation persistence and summarization
- **Hinglish Support**: Natural Indian language communication

## 📁 Project Structure

```
backend/
├── supabase/
│   └── functions/
│       ├── auth/           # Authentication functions
│       ├── chat/           # Chat-related functions
│       ├── personas/       # Persona management
│       ├── notifications/  # Push notification functions
│       └── utils/          # Utility functions
├── register.ts             # User registration
├── get-personas.ts         # Fetch available personas
├── chat-handler.ts         # Main chat processing
├── persona-manager.ts      # Persona context & summarization
├── get_messages.ts         # Message retrieval
├── reissue-api-key.ts      # JWT token refresh
├── summarize-and-notify.ts # Push notifications
├── thread-summarizer.ts    # Thread summarization
├── package.json
├── .env.example
└── README.md
```

## 🛠️ Setup

### Prerequisites

- [Deno](https://deno.land/) >= 1.40.0
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Supabase project
- Google Gemini API key
- Firebase project (for push notifications)

### Installation

1. **Clone and setup**:
   ```bash
   git clone <your-repo>
   cd backend
   ```

2. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

3. **Login to Supabase**:
   ```bash
   supabase login
   ```

4. **Link to your project**:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```

5. **Environment Setup**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret_key

# Encryption
ACCESS_KEY=your_rsa_private_key_pem

# AI Services
GEMINI_API_KEY=your_gemini_api_key

# Firebase (for push notifications)
FCM_PROJECT_ID=your_firebase_project_id
FCM_CLIENT_EMAIL=your_firebase_client_email
FCM_PRIVATE_KEY=your_firebase_private_key
```

## 🚀 Deployment

The `deploy.sh` script supports flexible deployment options:

### Deploy All Functions
```bash
./deploy.sh
# or
./deploy.sh all
```

### Deploy by Category
```bash
./deploy.sh auth          # Deploy only auth functions
./deploy.sh chat          # Deploy only chat functions
./deploy.sh personas      # Deploy only persona functions
./deploy.sh notifications # Deploy only notification functions
```

### Deploy Individual Functions
```bash
./deploy.sh persona-manager    # Deploy just persona-manager
./deploy.sh chat-handler       # Deploy just chat-handler
./deploy.sh register           # Deploy just register
# ... etc
```

### Available Functions
**Auth Functions:**
- `register` - User registration
- `reissue-api-key` - Token refresh

**Chat Functions:**
- `chat-handler` - Main chat processor
- `get_messages` - Message retrieval

**Persona Functions:**
- `get-personas` - Persona listing
- `persona-manager` - Context builder

**Notification Functions:**
- `summarize-and-notify` - Push notifications
- `thread-summarizer` - Thread summaries

### Show All Options
```bash
./deploy.sh help
```

### Development
```bash
supabase functions serve
# or
npm run dev
```

## 📚 API Endpoints

### Authentication
- `POST /register` - User registration with encrypted payload
- `POST /reissue-api-key` - Refresh JWT token

### Chat
- `POST /chat-handler` - Send message and get AI response
- `POST /get_messages` - Retrieve conversation history

### Personas
- `GET /get-personas` - List available AI personas
- `POST /persona-manager` - Manage persona context and summaries

### Notifications
- `POST /summarize-and-notify` - Send push notifications
- `POST /thread-summarizer` - Summarize conversation threads

## 🔧 Database Schema

The app expects these Supabase tables:

- `users` - User profiles and FCM tokens
- `personas` - AI character definitions
- `threads` - Conversation threads
- `messages` - Individual chat messages

## 🛡️ Security

- **Encrypted Registration**: RSA-OAEP + AES-CBC encryption
- **JWT Authentication**: Secure token-based API access
- **CORS Protection**: Proper CORS headers for web clients
- **Input Validation**: Comprehensive request validation

## 📱 Mobile Integration

The backend is designed to work with mobile apps that can:
- Handle encrypted registration payloads
- Store and use JWT tokens
- Receive FCM push notifications
- Display multiple AI personas

## 🔄 Background Jobs

- **Thread Summarization**: Automatically summarizes old conversations
- **Push Notifications**: Sends personalized teasers to re-engage users

## 📊 Monitoring

Use Supabase Dashboard to monitor:
- Function execution logs
- Database performance
- Error rates
- User activity

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
