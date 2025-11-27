// Quick script to check what's in AsyncStorage
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

AsyncStorage.getItem('AIFriendStore').then(data => {
  if (data) {
    const parsed = JSON.parse(data);
    console.log('Chats in storage:', Object.keys(parsed.state?.chats || {}));
    console.log('Chat count:', Object.keys(parsed.state?.chats || {}).length);
  } else {
    console.log('No data in AIFriendStore');
  }
});
