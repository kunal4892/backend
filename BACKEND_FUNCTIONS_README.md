# Backend Functions Documentation

## 📚 Overview

This document provides comprehensive documentation for all Supabase Edge Functions powering the AI Friend chat application. These functions handle authentication, chat processing, persona management, content moderation, and push notifications.

**Tech Stack:**
- **Runtime**: Deno 1.40+
- **Framework**: Supabase Edge Functions
- **Database**: PostgreSQL (via Supabase)
- **AI Service**: Google Gemini 2.5 Pro/Flash
- **Authentication**: JWT (JSON Web Tokens)
- **Encryption**: RSA-OAEP + AES-CBC

---

## 🏗️ Architecture

### Function Categories

```
supabase/functions/
├── auth/                    # Authentication & Security
│   ├── register/           # User registration with encryption
│   └── (implicit)          # JWT token refresh via authMiddleware
├── chat/                    # Chat Processing
│   ├── chat-handler/       # Main chat processing with Gemini
│   └── get_messages/       # Message retrieval with pagination
├── personas/                # AI Persona Management
│   ├── get-personas/       # Fetch available personas
│   └── persona-manager/    # Build persona context
├── moderation/              # Content Moderation
│   └── report-content/     # User reporting system
├── notifications/           # Push Notifications
│   ├── summarize-and-notify/  # Generate teasers & send notifications
│   └── thread-summarizer/     # Summarize old conversations
├── topics/                  # Analytics
│   └── extract-topics/     # Extract user topics/interests
└── utils/                   # Shared Utilities
    ├── authMiddleware.ts    # JWT verification & refresh
    └── personaUtils.ts      # Persona context building
```

### Request Flow

```
Mobile App
    ↓
[Authentication] → JWT Token
    ↓
[API Request] → Edge Function
    ↓
[Auth Middleware] → Verify/Refresh Token
    ↓
[Business Logic] → Database + External APIs
    ↓
[Response] → JSON Response
```

---

## 🔐 Authentication Functions

### `register`

**Purpose**: Secure user registration with encrypted payload decryption.

**Endpoint**: `POST /functions/v1/register`

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer {SUPABASE_ANON_KEY}
```

**Request Body**:
```json
{
  "encrypted_key": "base64-encoded-rsa-encrypted-aes-key",
  "iv": "hex-encoded-iv",
  "payload": "base64-encoded-aes-encrypted-json"
}
```

**Decrypted Payload Structure**:
```json
{
  "phone": "9876543210",
  "fcm_token": "firebase-cloud-messaging-token"
}
```

**Process**:
1. Decrypt AES key using RSA-OAEP private key
2. Decrypt payload using AES-CBC with decrypted key and IV
3. Validate phone number (10 digits)
4. Create/update user in database
5. Generate JWT token
6. Return token to client

**Response**:
```json
{
  "success": true,
  "app_key": "jwt-token",
  "phone": "9876543210",
  "user": {
    "phone": "9876543210",
    "idx": 123,
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

**Encryption Details**:
- **RSA-OAEP**: 2048-bit key, SHA-256 hash
- **AES-CBC**: 256-bit key, PKCS7 padding
- **Private Key**: Stored in `ACCESS_KEY` environment variable (PEM format)

**Environment Variables**:
- `ACCESS_KEY`: RSA private key (PEM format)
- `JWT_SECRET`: Secret for JWT signing
- `SUPABASE_URL`: Supabase project URL
- `SERVICE_ROLE_KEY`: Supabase service role key

---

### `verifyAndRefreshToken` (authMiddleware)

**Purpose**: JWT token verification with automatic refresh if expired.

**Location**: `supabase/functions/utils/authMiddleware.ts`

**Functions**:
- `verifyToken()`: Fast verification (no DB call) - for regular operations
- `verifyAndRefreshToken()`: Full verification with DB check - for token refresh

**Process**:
1. Extract token from `Authorization: Bearer {token}` header
2. Verify JWT signature using `JWT_SECRET`
3. Check expiration
4. If expired, generate new token and update database
5. Return user phone and optional new token

**Token Payload**:
```json
{
  "phone": "9876543210",
  "exp": 1737123456,
  "iat": 1737037056
}
```

**Response**:
```typescript
{
  phone: string;
  token: string;
  newToken?: string;  // If token was refreshed
  wasRefreshed: boolean;
  fcmToken?: string;  // FCM token from user record
}
```

---

## 💬 Chat Functions

### `chat-handler`

**Purpose**: Main chat processing function that handles user messages and generates AI responses using Gemini.

**Endpoint**: `POST /functions/v1/chat-handler`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
X-FCM-Token: {optional-fcm-token}
```

**Request Body**:
```json
{
  "personaId": "persona-uuid",
  "text": "User message text"
}
```

**Process Flow**:
1. **Authenticate**: Verify JWT token (fast verification)
2. **Get Thread**: Fetch or create conversation thread
3. **Get Persona**: Fetch persona configuration
4. **Fetch History**: Get last 10 messages for context
5. **Build Context**: Combine persona context with chat history
6. **Call Gemini**: Send message to Gemini 2.5 Pro API
7. **Process Response**: Parse Gemini response (handles multiple candidates)
8. **Save Messages**: Store user message and bot response
9. **Update Thread**: Update thread timestamp
10. **Return Response**: Send replies and message objects back

**Gemini Integration**:
- **Model**: `gemini-2.5-pro`
- **Configuration**:
  - Candidate count: 2
  - Temperature: 0.9
  - Max output tokens: 2048
- **System Instruction**: Persona context (if available)
- **Message Format**: Array of role/text pairs

**Response**:
```json
{
  "threadId": "thread-uuid",
  "replies": ["Bot reply text 1", "Bot reply text 2"],
  "messages": [
    {
      "id": "message-uuid",
      "role": "bot",
      "text": "Bot reply text",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "new_token": "optional-new-jwt-if-refreshed"
}
```

**Performance Optimizations**:
- Fast token verification (no DB call)
- Parallel fetching (thread + persona)
- Parallel fetching (history + context building)
- Non-blocking message saves
- Reduced history limit (10 messages)

**Error Handling**:
- Friendly error messages in Hinglish
- Graceful degradation
- Silent error handling for better UX

**Environment Variables**:
- `GEMINI_API_KEY`: Google Gemini API key
- `JWT_SECRET`: JWT secret key
- `SUPABASE_URL`: Supabase project URL
- `SERVICE_ROLE_KEY`: Supabase service role key

---

### `get_messages`

**Purpose**: Retrieve conversation messages with pagination support.

**Endpoint**: `POST /functions/v1/get_messages`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body**:
```json
{
  "personaId": "persona-uuid",
  "page": 0,
  "pageSize": 100
}
```

**Process**:
1. Authenticate user
2. Find thread by personaId and user phone
3. Fetch messages with pagination
4. Map database roles to frontend roles (model → bot)
5. Return messages and total count

**Response**:
```json
{
  "messages": [
    {
      "id": "message-uuid",
      "role": "bot",  // or "user"
      "text": "Message text",
      "created_at": "2025-01-15T10:30:00Z",
      "thread_id": "thread-uuid"
    }
  ],
  "totalMessages": 150,
  "page": 0,
  "pageSize": 100
}
```

**Pagination**:
- Default page: 0
- Default pageSize: 100
- Messages ordered by `created_at` ascending (oldest first)
- Returns total count for pagination UI

---

## 🎭 Persona Functions

### `get-personas`

**Purpose**: Fetch available AI personas for the user to chat with.

**Endpoint**: `GET /functions/v1/get-personas` or `POST /functions/v1/get-personas`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Optional Query Parameters** (GET):
- `id`: Specific persona ID (optional)

**Optional Request Body** (POST):
```json
{
  "id": "optional-persona-uuid"
}
```

**Process**:
1. Authenticate user (with token refresh)
2. Build query (all personas or specific persona)
3. Fetch from database
4. Return persona list

**Response**:
```json
{
  "personas": [
    {
      "id": "persona-uuid",
      "name": "Persona Name",
      "system_prompt": "Base personality prompt",
      "style_prompt": "Formatting and style instructions",
      "short_summary": "Brief description",
      "long_doc": "Full character profile",
      "image_url": "https://...",
      "caption": "Display caption"
    }
  ],
  "new_token": "optional-new-jwt-if-refreshed"
}
```

**Features**:
- Token auto-refresh
- Supports filtering by ID
- Returns all persona fields needed by frontend

---

### `persona-manager`

**Purpose**: Build persona context for AI conversations.

**Endpoint**: `POST /functions/v1/persona-manager`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body**:
```json
{
  "action": "buildContext",
  "personaId": "persona-uuid",
  "phone": "9876543210",
  "personaData": { /* optional fallback persona */ },
  "isFirst": false
}
```

**Actions**:
- `buildContext`: Builds persona context string

**Process**:
1. Authenticate user
2. Fetch latest persona from database
3. Merge with provided personaData (fallback)
4. Build context string combining:
   - System prompt (base personality)
   - Style prompt (formatting rules)
   - Persona document (full or short based on `isFirst`)

**Response**:
```json
{
  "context": "Combined persona context string..."
}
```

**Context Structure**:
```
{system_prompt}

{style_prompt}

You're roleplaying for this {phone} as {persona.name}.

{personaDoc}
```

**Style Prompt Features**:
- Mandatory formatting: Split into 2-3 bubbles using `&&&`
- Language: Hinglish (Hindi + English mix)
- Tone: Casual, friendly
- Message length: 1-3 sentences per bubble

---

## 🛡️ Moderation Functions

### `report-content`

**Purpose**: Handle user reports of inappropriate AI-generated content (Google Play compliance).

**Endpoint**: `POST /functions/v1/report-content`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body**:
```json
{
  "messageId": "message-uuid",
  "reason": "offensive",  // or "inappropriate", "harmful", "spam", "other"
  "additionalInfo": "Optional additional context"
}
```

**Valid Reasons**:
- `offensive`: Offensive content
- `inappropriate`: Inappropriate content
- `harmful`: Harmful or dangerous content
- `spam`: Spam or misleading content
- `other`: Other reasons

**Process**:
1. Authenticate user
2. Validate request body (messageId, reason required)
3. Validate reason against whitelist
4. Fetch message from database
5. Verify message is bot-generated (role = "bot" or "model")
6. Insert report into `content_reports` table
7. Return success response

**Response**:
```json
{
  "success": true,
  "message": "Report submitted successfully",
  "reportId": "report-uuid",
  "new_token": "optional-new-jwt-if-refreshed"
}
```

**Validation**:
- Only bot messages can be reported
- Message must exist in database
- Reason must be from valid list
- User must be authenticated

**Database Schema** (content_reports):
- `id`: UUID (primary key)
- `message_id`: UUID (foreign key to messages)
- `thread_id`: UUID (foreign key to threads)
- `reported_by`: TEXT (user phone number)
- `reason`: TEXT (validated reason)
- `additional_info`: TEXT (optional)
- `message_text`: TEXT (snapshot of reported message)
- `status`: TEXT (pending, reviewed, resolved, dismissed)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

---

## 🔔 Notification Functions

### `summarize-and-notify`

**Purpose**: Generate personalized conversation teasers and send push notifications to re-engage users.

**Endpoint**: Can be triggered via cron or manually

**Process Flow**:
1. Fetch all users with FCM tokens
2. For each user:
   - Get their last conversation thread
   - Fetch last 30 messages
   - Generate teaser using Gemini
   - Insert teaser as bot message
   - Send FCM push notification
3. Return summary

**Teaser Generation**:
- Uses Gemini 1.5 Flash (fast model)
- Generates short, engaging message (1-2 sentences)
- Based on conversation context
- Personalized with persona name

**FCM Notification**:
```json
{
  "message": {
    "token": "fcm-token",
    "notification": {
      "title": "Persona Name",
      "body": "Generated teaser text",
      "image": "persona-image-url"
    },
    "data": {
      "personaId": "persona-uuid"
    }
  }
}
```

**Gemini Model**: `gemini-1.5-flash` (optimized for speed)

**Features**:
- Personalized notifications
- Context-aware teasers
- Persona images in notifications
- Deep linking to specific chats

**Environment Variables**:
- `FCM_PROJECT_ID`: Firebase project ID
- `FCM_CLIENT_EMAIL`: Firebase service account email
- `FCM_PRIVATE_KEY`: Firebase service account private key
- `GEMINI_API_KEY`: Gemini API key

---

### `thread-summarizer`

**Purpose**: Summarize old conversation threads to reduce context size and improve performance.

**Endpoint**: Can be triggered via cron or manually

**Process**:
1. Find threads older than 2 hours (not recently summarized)
2. For each thread:
   - Fetch all messages
   - Generate summary using Gemini 1.5 Pro
   - Update thread with summary and timestamp
3. Return summary of processed threads

**Summary Update**:
- Stores summary in `threads.summary` field
- Updates `threads.summary_updated_at` timestamp
- Helps reduce context size for future conversations

**Gemini Model**: `gemini-1.5-pro` (for quality summaries)

**Stale Threshold**: 7200 seconds (2 hours)

**Safety Limit**: Processes max 20 threads per run

---

## 📊 Analytics Functions

### `extract-topics`

**Purpose**: Extract user topics, interests, sentiment, and key entities from conversations.

**Endpoint**: `POST /functions/v1/extract-topics`

**Request Headers**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Process**:
1. Authenticate user
2. Fetch conversation messages
3. Send to Gemini for topic extraction
4. Parse extracted topics (JSON format)
5. Update `user_topics` table
6. Merge with existing topics

**Extracted Data**:
- Topics/interests mentioned
- User sentiment/mood
- Key entities (people, places, events)
- Keywords

**Storage**: Updates `user_topics` table with merged keywords

**Gemini Model**: `gemini-1.5-flash` (optimized for extraction tasks)

---

## 🛠️ Utility Functions

### `authMiddleware.ts`

**Location**: `supabase/functions/utils/authMiddleware.ts`

**Exports**:
- `verifyToken()`: Fast JWT verification (no DB call)
- `verifyAndRefreshToken()`: Full verification with auto-refresh
- `hashFcmToken()`: Hash FCM token for JWT binding

**Key Features**:
- Token auto-refresh if expired
- FCM token binding for device security
- Fast path for regular operations (no DB call)
- Full path for token refresh operations

**Usage Example**:
```typescript
import { verifyAndRefreshToken } from "../utils/authMiddleware.ts";

const authResult = await verifyAndRefreshToken(authHeader, req);
const phone = authResult.phone;
// Use authResult.newToken if token was refreshed
```

---

### `personaUtils.ts`

**Location**: `supabase/functions/chat-handler/utils/personaUtils.ts`

**Exports**:
- `buildPersonaContext()`: Builds complete persona context string

**Features**:
- Combines system prompt, style prompt, and persona doc
- Handles first-time vs. returning user contexts
- Default style prompt if not in database
- Dynamic persona document selection

---

## 🔒 Security Features

### Authentication
- **JWT Tokens**: Secure token-based authentication
- **Token Refresh**: Automatic token refresh on expiration
- **FCM Binding**: Cryptographic binding of FCM tokens to prevent token theft
- **Phone as Primary Key**: Phone number used as user identifier

### Encryption
- **Registration Encryption**: RSA-OAEP + AES-CBC for secure registration
- **Key Management**: Private keys stored in environment variables
- **Secure Storage**: No sensitive data in logs

### Input Validation
- **Request Validation**: All inputs validated before processing
- **SQL Injection Protection**: Parameterized queries (Supabase client)
- **Type Checking**: TypeScript for type safety

### CORS
- **Configurable Origins**: CORS headers for web clients
- **Method Restrictions**: Only allowed HTTP methods
- **Header Control**: Controlled allowed headers

---

## 🗄️ Database Schema

### Required Tables

**users**
- `phone` (TEXT, PRIMARY KEY): User phone number
- `fcm_token` (TEXT): Firebase Cloud Messaging token
- `idx` (INTEGER): User index
- `created_at` (TIMESTAMPTZ): Creation timestamp

**personas**
- `id` (UUID, PRIMARY KEY): Persona identifier
- `name` (TEXT): Persona name
- `system_prompt` (TEXT): Base personality prompt
- `style_prompt` (TEXT): Formatting and style instructions
- `short_summary` (TEXT): Brief description
- `long_doc` (TEXT): Full character profile
- `image_url` (TEXT): Persona image URL
- `caption` (TEXT): Display caption

**threads**
- `id` (UUID, PRIMARY KEY): Thread identifier
- `phone` (TEXT): User phone number
- `persona_id` (UUID): Persona identifier
- `summary` (TEXT): Conversation summary
- `summary_updated_at` (TIMESTAMPTZ): Last summary update
- `updated_at` (TIMESTAMPTZ): Last update timestamp

**messages**
- `id` (UUID, PRIMARY KEY): Message identifier
- `thread_id` (UUID): Thread identifier
- `role` (TEXT): "user" or "bot" (or "model")
- `text` (TEXT): Message text
- `created_at` (TIMESTAMPTZ): Creation timestamp

**content_reports**
- `id` (UUID, PRIMARY KEY): Report identifier
- `message_id` (UUID): Reported message ID
- `thread_id` (UUID): Thread identifier
- `reported_by` (TEXT): User phone number
- `reason` (TEXT): Report reason
- `additional_info` (TEXT): Additional context
- `message_text` (TEXT): Snapshot of reported message
- `status` (TEXT): Report status
- `created_at` (TIMESTAMPTZ): Creation timestamp

---

## 🚀 Deployment

### Using deploy.sh Script

**Deploy All Functions**:
```bash
./deploy.sh
# or
./deploy.sh all
```

**Deploy by Category**:
```bash
./deploy.sh auth          # Auth functions
./deploy.sh chat          # Chat functions
./deploy.sh personas      # Persona functions
./deploy.sh notifications # Notification functions
```

**Deploy Individual Function**:
```bash
./deploy.sh chat-handler
./deploy.sh get-personas
./deploy.sh report-content
# etc.
```

### Manual Deployment

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

### Environment Variables

Set environment variables in Supabase Dashboard:
- Go to Project Settings → Edge Functions → Secrets
- Add required environment variables

**Required Variables**:
```
SUPABASE_URL
SERVICE_ROLE_KEY
JWT_SECRET
GEMINI_API_KEY
ACCESS_KEY (RSA private key for registration)
FCM_PROJECT_ID
FCM_CLIENT_EMAIL
FCM_PRIVATE_KEY
```

---

## 📝 API Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* response data */ },
  "new_token": "optional-new-jwt-if-refreshed"
}
```

### Error Response
```json
{
  "error": "Error type",
  "message": "Human-readable error message"
}
```

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request (invalid input)
- `401`: Unauthorized (authentication failed)
- `404`: Not Found
- `500`: Internal Server Error

---

## 🔍 Monitoring & Debugging

### Logging
- All functions use `console.log()` for logging
- Logs available in Supabase Dashboard → Edge Functions → Logs
- Structured logging with emojis for easy scanning

### Performance Metrics
- Functions log timing information
- Example: `⏱️ Auth (fast): 15ms`
- Monitor for performance bottlenecks

### Error Handling
- Try-catch blocks around all operations
- Friendly error messages for users
- Detailed error logs for debugging

---

## 📚 Best Practices

### Code Organization
- Separate utility functions in `utils/` directory
- Reusable authentication middleware
- Consistent error handling

### Performance
- Use fast token verification for regular operations
- Parallel fetching where possible
- Reduce database queries
- Optimize Gemini API calls

### Security
- Never log sensitive data
- Validate all inputs
- Use parameterized queries
- Encrypt sensitive data in transit

### Error Messages
- User-friendly messages in Hinglish
- Don't expose internal errors
- Silent error handling for better UX

---

## 🔄 Function Dependencies

```
register
  └─→ authMiddleware (implicit)

chat-handler
  ├─→ authMiddleware (verifyAndRefreshToken)
  └─→ personaUtils (buildPersonaContext)

get_messages
  └─→ authMiddleware (verifyAndRefreshToken)

get-personas
  └─→ authMiddleware (verifyAndRefreshToken)

persona-manager
  └─→ authMiddleware (JWT verify)

report-content
  └─→ authMiddleware (verifyAndRefreshToken)

summarize-and-notify
  └─→ (standalone, uses service role)

thread-summarizer
  └─→ (standalone, uses service role)

extract-topics
  └─→ authMiddleware (verifyAndRefreshToken)
```

---

## 📖 Additional Resources

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Documentation](https://deno.land/docs)
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [JWT.io](https://jwt.io/) - JWT token debugging
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)

---

## 🤝 Contributing

When adding new functions:
1. Follow existing code structure
2. Use `authMiddleware` for authentication
3. Implement proper error handling
4. Add CORS headers
5. Update this documentation
6. Test thoroughly before deployment

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Maintained By**: Development Team

