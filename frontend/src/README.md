🚀 Overview

AiSi is a mobile app (React Native) that simulates fun, flirty, and supportive conversations with personas like Tara, Kabir, Zoya, and Ramya.
The app mimics WhatsApp-style chats with typing simulation, persona-specific replies, and multiple chat bubbles.

We also integrated a Firebase OTP login system with user registration (age, gender, location, phone) and stored the data in AsyncStorage.

✅ Features Implemented
1. Persona System

Defined personas (tara, kabir, zoya, ramya) in src/constants/personas.ts.

Each persona includes:

Local image (stored in /assets/personas/).

systemPrompt for style/tone.

Long biography doc (src/persona_docs/*).

Optional shortSummary (generated after first chat).

2. Home Screen

Grid of persona cards (local images, captions).

Tap Chat → opens chat screen for that persona.

Design: dark header, modern grid with shadows.

3. Chats

WhatsApp-style UI:

Bubble layout (user right, bot left).

Persona image + name in header.

Timestamp + "Seen" indicator.

Typing simulation:

Messages split using &&&.

Rendered one bubble at a time, character-by-character.

ChatStore (Zustand + AsyncStorage):

sendUserMessage handles:

Push user msg immediately.

Call backend (Supabase Edge function).

Split reply into bubbles + simulate typing.

Cache persona summary.

4. Backend (Supabase Edge Functions)

chat-handler: forwards prompts to Gemini API.

For quota exhaustion, we added a dummy hardcoded response for testing:

const text = "Hey there! 😉 &&& How’s your day going? ☀️ &&& Wanna hear a silly secret? 😏";


register: (to be extended) will store user registration data into Supabase DB.

5. Login & Registration

LoginScreen.tsx collects:

Phone number (+91 format).

Age (must be ≥18).

Gender (dropdown).

Location (dropdown from CITIES.ts).

Firebase OTP flow:

Send OTP → Verify OTP.

If success:

Store phone and userData in AsyncStorage.

Reset navigation → go to Home (MainTabs).

UI:

Dark theme.

Register header image.

Centered title/subtitle.

6. Navigation (RootNavigator.tsx)

Handles login state:

If user has phone in AsyncStorage → go to MainTabs.

Else → show LoginScreen.

MainTabs → Home + Chats.

Separate ChatScreen for ongoing chat.

📂 Project Structure
src/
├── assets/personas/          # Local persona images
├── constants/
│    ├── personas.ts          # Persona definitions
│    └── cities.ts            # India cities list
├── persona_docs/             # Full persona markdown docs
├── navigation/
│    └── RootNavigator.tsx    # Stack + Tab navigation
├── screens/
│    ├── HomeScreen.tsx       # Persona grid
│    ├── ChatScreen.tsx       # WhatsApp-style chat
│    ├── ChatsScreen.tsx      # List of past chats
│    └── LoginScreen.tsx      # OTP + registration
├── store/
│    ├── chatStore.ts         # Zustand store (chats + personas)
│    ├── personaManager.ts    # Build persona contexts, summarization
│    └── types.ts             # Types for Chat, Msg, Persona
└── lib/
└── api.ts               # Calls Supabase Edge function

🔧 Setup Instructions
1. Clone repo & install deps
   git clone <repo>
   cd AiSiApp
   npm install

2. Firebase setup

Create Firebase project.

Enable Phone Authentication.

Add Android app:

Package name = com.aifriend (check your android/app/build.gradle).

Download google-services.json → place in android/app/.

Add SHA-1 + SHA-256 keys to Firebase.

cd android
./gradlew signingReport


Enable billing if needed (Firebase phone auth requires).

3. Supabase Edge Functions

chat-handler: receives messages, calls Gemini or dummy fallback.

register: (next step) will store user data into DB.

4. Run app
   npx react-native run-android

🧪 Testing

OTP can be tested using Firebase test phone numbers with fixed OTP.

Chat works with dummy response if Gemini quota is exceeded.

🛠️ Next Steps

Store registration data in Supabase DB via register function.

Add logout button (clear AsyncStorage, go back to Login).

Add analytics + push notifications.

Replace dummy Gemini fallback with streaming API.