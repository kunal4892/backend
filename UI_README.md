# UI Architecture & Component Documentation

## 📱 Overview

This document provides a comprehensive guide to the UI architecture, components, screens, and styling patterns used in the AI Friend mobile application (React Native).

---

## 🏗️ Architecture

### Tech Stack
- **Framework**: React Native
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **State Management**: Zustand (with AsyncStorage persistence)
- **Styling**: StyleSheet API (React Native)
- **Animations**: React Native Animated API
- **Safe Areas**: react-native-safe-area-context

### Project Structure
```
frontend/src/
├── screens/          # Main application screens
├── components/       # Reusable UI components
├── navigation/       # Navigation configuration
├── context/          # React Context providers
├── store/             # Zustand state management
├── lib/              # API clients and utilities
└── utils/            # Helper functions and loaders
```

---

## 🎨 Design System

### Color Palette

#### Primary Colors
- **Purple Primary**: `#7D4EFF` - Main brand color, buttons, accents
- **Dark Background**: `#1B0E24` - Main app background
- **Dark Header**: `#2A1537` - Header backgrounds
- **Light Background**: `#F4F2F8` - Chat screen background

#### UI Colors
- **User Message**: `#E9DDFF` - Light purple bubble
- **Bot Message**: `#FFFFFF` - White bubble with shadow
- **Input Bar**: `#1b0e24` - Dark input container
- **Text Primary**: `#222` - Main text color
- **Text Secondary**: `#777` - Secondary text, timestamps
- **Text Tertiary**: `#999` - Placeholders, disabled states

### Typography
- **Logo**: 22px, weight 900, letter-spacing 6
- **Header Names**: 16px, weight 600
- **Body Text**: 15px, weight 400
- **Small Text**: 11-13px, weight 400 (timestamps, metadata)
- **Button Text**: 15-16px, weight 600-700

### Spacing
- **Container Padding**: 12-20px
- **Card Padding**: 10-12px
- **Input Padding**: 8-16px
- **Gap Between Elements**: 6-12px

### Border Radius
- **Cards**: 12-14px
- **Bubbles**: 16px (with corner cutouts)
- **Buttons**: 8-20px
- **Avatars**: 50% (circular)

---

## 📺 Screens

### 1. LoginScreenSimple (`screens/LoginScreenSimple.tsx`)

**Purpose**: Simple phone number-based registration with encryption.

**Key Features**:
- Phone number input (10 digits, India +91)
- RSA + AES encryption for secure registration
- FCM token collection for push notifications
- Keyboard-aware layout

**UI Elements**:
- Logo image (circular, 120x120)
- Phone input with country code prefix
- Register button (disabled until valid phone)
- Loading states during registration

**Styling Highlights**:
- White background (`#ffffff`)
- Clean, minimal design
- KeyboardAvoidingView for iOS/Android compatibility

---

### 2. HomeScreen (`screens/HomeScreen.tsx`)

**Purpose**: Display available AI personas in a 2-column grid.

**Key Features**:
- Responsive grid layout (2 columns)
- Dynamic card sizing based on screen dimensions
- Persona images with fallback avatars
- Loading states per persona
- Navigation to chat on selection

**UI Elements**:
- Header with "AiSi" logo
- Grid of persona cards
- Each card shows:
  - Persona image (or initial letter)
  - Persona name
  - Short summary/caption
  - "Chat" button

**Layout Logic**:
- Cards fill available screen height
- Aspect ratio: 0.55 (taller cards)
- Minimum height: 120px for image container
- Responsive to screen rotation

**Styling Highlights**:
- Dark theme (`#1B0E24` background)
- White cards with subtle shadows
- Purple accent for avatars (`#4c1d95`)
- Loading spinner overlay on cards

---

### 3. ChatsScreen (`screens/ChatsScreen.tsx`)

**Purpose**: List of all active conversations.

**Key Features**:
- Sorted by last message timestamp (newest first)
- Shows last message preview
- Persona avatar and name
- Empty state when no chats exist
- Loading state during hydration

**UI Elements**:
- FlatList of chat items
- Each item shows:
  - Persona avatar (or initial)
  - Persona name
  - Last message preview (cleaned of `&&&` separators)
  - Timestamp (HH:MM format)
  - Loading spinner when opening chat

**Styling Highlights**:
- Dark background (`#1B0E24`)
- White chat rows with rounded corners
- Purple avatar fallback (`#7D4EFF`)
- Subtle shadows for depth

---

### 4. ChatScreen (`screens/ChatScreen.tsx`)

**Purpose**: Main chat interface with messages, input, and interactions.

**Key Features**:
- Message bubbles (user/bot)
- Real-time typing indicator
- Pagination (load older messages on scroll up)
- Keyboard-aware input bar
- Message options menu (Copy, Share, Report)
- Content reporting (Google Play compliance)
- Auto-scroll to bottom for new messages
- Floating scroll-to-bottom button

**UI Elements**:

#### Header
- Dynamic header with persona avatar and name
- Purple theme (`#3E1F47`)

#### Message List
- FlatList with optimized rendering
- User messages: Right-aligned, purple tint (`#E9DDFF`)
- Bot messages: Left-aligned, white with shadow
- Message metadata: Timestamp + delivery ticks (user only)
- Menu button (three dots) on bot messages

#### Input Bar
- Fixed at bottom with dynamic keyboard offset
- Text input with send button
- Adaptive bottom margin based on keyboard height
- Safe area handling for notched devices

#### Floating Elements
- Scroll-to-bottom button (appears when not at bottom)
- Positioned above input bar

**Keyboard Handling**:
- Listens to keyboard show/hide events
- Calculates adaptive keyboard height (35% of screen as fallback)
- Handles negative/invalid keyboard heights (Android edge cases)
- Buffer height: 24px for clearance

**Message Options Menu**:
- Triggered by three-dot button on bot messages
- Options:
  - **Copy**: Copy message to clipboard
  - **Share**: Native share dialog
  - **Report**: Content reporting flow
- Report reasons:
  - Offensive Content
  - Inappropriate
  - Harmful or Dangerous
  - Spam or Misleading
  - Other

**Pagination**:
- Loads 100 messages per page
- Triggers on scroll to top
- Maintains scroll position when loading older messages
- Prevents duplicate messages

**Styling Highlights**:
- Light background (`#F4F2F8`)
- Rounded message bubbles (16px radius)
- Corner cutouts for chat bubble effect
- Smooth animations for message appearance
- Shadow effects for depth

---

## 🧩 Components

### TypingIndicator (`components/TypingIndicator.tsx`)

**Purpose**: Animated typing indicator for bot messages.

**Features**:
- Three bouncing dots animation
- Animated opacity and scale
- Styled as chat bubble

**Usage**:
```tsx
<TypingIndicator />
```

**Styling**:
- Light gray background (`#f0f0f0`)
- Rounded container (20px)
- Left-aligned (bot message style)

---

### ChatLoader (`utils/chatLoader.tsx`)

**Purpose**: Loading screen with animated emojis and typing indicator.

**Features**:
- Floating emoji animations (💬, ❤️, 😉, 😅)
- Typing indicator bubble
- "Loading your chat..." text

**Animations**:
- Emojis float up and fade in/out
- Dots bounce in sequence
- Continuous loop until chat loads

---

## 🧭 Navigation

### RootNavigator (`navigation/RootNavigator.tsx`)

**Structure**:
```
Stack Navigator (Root)
├── Login (Stack Screen)
│   └── LoginScreenSimple (or LoginScreen)
└── MainTabs (Stack Screen)
    └── Bottom Tab Navigator
        ├── Home (Tab)
        └── Chats (Tab)
    └── Chat (Stack Screen - overlays tabs)
```

**Navigation Flow**:
1. **Initial Route**: Determined by `app_key` in AsyncStorage
   - Has key → `MainTabs`
   - No key → `Login`

2. **Authentication**: After login, navigates to `MainTabs`

3. **Chat Navigation**: 
   - From Home: Select persona → Navigate to Chat
   - From Chats: Select conversation → Navigate to Chat
   - Chat screen overlays tabs (always shows back button)

**Key Features**:
- Conditional rendering based on auth state
- Zustand hydration handling
- PersonaProvider wraps MainTabs for persona context

---

## 🎭 Context Providers

### PersonaContext (`context/PersonaContext.tsx`)

**Purpose**: Share persona data across Home and Chats screens.

**API**:
```tsx
const { personas, setPersonas } = usePersonas();
```

**Usage**:
- HomeScreen fetches and sets personas
- ChatsScreen reads personas to enrich chat list
- Prevents duplicate API calls

---

## 🎨 Styling Patterns

### StyleSheet Organization

Each screen/component uses `StyleSheet.create()` with organized sections:

```typescript
const styles = StyleSheet.create({
  // Container/Layout
  container: { ... },
  
  // Header
  header: { ... },
  
  // Content
  content: { ... },
  
  // Components
  card: { ... },
  button: { ... },
  
  // States
  disabled: { ... },
  loading: { ... },
});
```

### Responsive Design

**Screen Dimensions**:
```typescript
import { Dimensions, useWindowDimensions } from 'react-native';

// Static (use sparingly)
const { width, height } = Dimensions.get('window');

// Reactive (preferred)
const { width, height } = useWindowDimensions();
```

**Adaptive Sizing**:
- Cards: Calculate width based on screen width
- Heights: Use flex or calculated heights
- Fonts: Consider using `PixelRatio` for scaling

### Safe Area Handling

**Implementation**:
```tsx
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Container
<SafeAreaView edges={['top', 'bottom']} style={styles.container}>
  {/* Content */}
</SafeAreaView>

// Inset values
const insets = useSafeAreaInsets();
// Use insets.top, insets.bottom for padding/margins
```

**Usage**:
- ChatScreen: Bottom safe area for input bar
- HomeScreen: Top safe area for header
- ChatsScreen: Full safe area

---

## ⚡ Performance Optimizations

### FlatList Optimization

**ChatScreen Message List**:
```typescript
<FlatList
  initialNumToRender={50}
  maxToRenderPerBatch={20}
  windowSize={21}
  removeClippedSubviews={false}
  keyExtractor={(item, index) => String(item.id || `item-${index}`)}
/>
```

**Key Optimizations**:
- `initialNumToRender`: Render 50 items initially
- `maxToRenderPerBatch`: Render 20 items per batch
- `windowSize`: Keep 21 screens worth of items in memory
- `removeClippedSubviews`: Disabled for smoother scrolling

### Memoization

**Components**:
```tsx
const ChatBubble = memo(({ item, renderTicks, onMenuPress }) => {
  // Component implementation
});
```

**Callbacks**:
```tsx
const handleMenuPress = useCallback((message) => {
  // Handler logic
}, [dependencies]);
```

**Computed Values**:
```tsx
const inputBottomMargin = useMemo(() => {
  // Calculation logic
  return margin;
}, [keyboardHeight, insets.bottom]);
```

---

## 🔧 Keyboard Handling

### Implementation (ChatScreen)

**Listeners**:
```typescript
useEffect(() => {
  const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
  
  const showSub = Keyboard.addListener(showEvent, (e) => {
    setKeyboardHeight(e.endCoordinates.height);
  });
  
  const hideSub = Keyboard.addListener(hideEvent, () => {
    setKeyboardHeight(0);
  });
  
  return () => {
    showSub.remove();
    hideSub.remove();
  };
}, []);
```

**Adaptive Height Calculation**:
```typescript
const inputBottomMargin = useMemo(() => {
  if (keyboardHeight === 0) return 0;
  
  const screenHeight = Dimensions.get('window').height;
  const adaptiveDefaultHeight = Math.round(screenHeight * 0.35);
  const validKeyboardHeight = keyboardHeight > 0 
    ? keyboardHeight 
    : adaptiveDefaultHeight;
  
  const margin = Math.max(0, validKeyboardHeight - insets.bottom + INPUT_BUFFER_HEIGHT);
  return margin;
}, [keyboardHeight, insets.bottom]);
```

**Key Points**:
- Handles negative keyboard heights (Android edge cases)
- Uses 35% of screen height as fallback
- Adds 24px buffer for clearance
- Ensures non-negative margins

---

## 🎯 User Interactions

### Message Options Menu

**Trigger**: Three-dot button on bot messages

**Options**:
1. **Copy**: Uses `Clipboard.setString()`
2. **Share**: Uses `Share.share()` (native share dialog)
3. **Report**: Opens reporting flow with predefined reasons

**Implementation**:
```tsx
Alert.alert(
  "Chat Options",
  "",
  [
    { text: "Copy", onPress: () => Clipboard.setString(text) },
    { text: "Share", onPress: () => Share.share({ message: text }) },
    { text: "Report", onPress: () => handleReport(message), style: "destructive" },
    { text: "Cancel", style: "cancel" },
  ]
);
```

### Content Reporting

**Flow**:
1. User taps three-dot menu on bot message
2. Selects "Report"
3. Chooses reason (Offensive, Inappropriate, Harmful, Spam, Other)
4. Report submitted to backend
5. Success/error alert shown

**Validation**:
- Only bot messages can be reported
- Message must be synced (UUID, not numeric ID)
- Validates UUID format before submission

---

## 🐛 Known Issues & Solutions

### Android Keyboard Height

**Issue**: Some Android devices report negative or invalid keyboard heights.

**Solution**: 
- Use adaptive default (35% of screen height)
- Validate keyboard height before use
- Ensure margins are never negative

### Message ID Mismatch

**Issue**: Frontend uses numeric IDs, backend uses UUIDs.

**Solution**:
- Backend returns full message objects with UUIDs
- Frontend validates UUID before reporting
- Shows user-friendly message for unsynced messages

### Scroll Position on Pagination

**Issue**: Loading older messages can cause scroll jump.

**Solution**:
- Track first visible message ID before loading
- Scroll to that message after loading
- Use `scrollToIndex` with fallback to `scrollToOffset`

---

## 📝 Best Practices

### Component Organization
1. **Imports**: Group by type (React, React Native, third-party, local)
2. **Constants**: Define at top of file
3. **Hooks**: Use in logical order (state, effects, callbacks)
4. **Styles**: Define at bottom of file

### State Management
- Use Zustand for global state
- Use local state for UI-only state
- Use Context for shared data (personas)

### Error Handling
- Silent error handling in production (no console.logs)
- User-friendly error messages
- Graceful fallbacks for missing data

### Accessibility
- Use semantic components (`Pressable`, `TouchableOpacity`)
- Add `hitSlop` for small touch targets
- Provide loading states
- Handle empty states

---

## 🚀 Future Improvements

### Potential Enhancements
1. **Dark Mode**: System-based theme switching
2. **Animations**: More polished transitions
3. **Accessibility**: Screen reader support, larger text
4. **Internationalization**: Multi-language support
5. **Offline Support**: Queue messages when offline
6. **Rich Media**: Image/video support in messages
7. **Voice Messages**: Record and send audio

### Performance
1. **Image Optimization**: Lazy loading, caching
2. **Message Virtualization**: Further optimize FlatList
3. **Bundle Size**: Code splitting, tree shaking

---

## 📚 Additional Resources

### Key Files Reference
- **Main App**: `App.tsx` - Entry point, FCM setup
- **Navigation**: `navigation/RootNavigator.tsx` - Navigation structure
- **State**: `store/useChatStore.ts` - Global chat state
- **API**: `lib/api.ts` - API client functions

### External Dependencies
- `@react-navigation/native` - Navigation
- `react-native-safe-area-context` - Safe area handling
- `zustand` - State management
- `@react-native-async-storage/async-storage` - Local storage
- `@react-native-firebase/messaging` - Push notifications

---

## 👥 Team Notes

### Development Workflow
1. **New Screen**: Create in `screens/`, add to navigator
2. **New Component**: Create in `components/`, export
3. **Styling**: Follow existing patterns, use StyleSheet
4. **State**: Use Zustand for global, useState for local

### Testing Checklist
- [ ] Test on iOS and Android
- [ ] Test on different screen sizes
- [ ] Test keyboard behavior
- [ ] Test with slow network
- [ ] Test empty states
- [ ] Test error states
- [ ] Test navigation flow

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Development Team

