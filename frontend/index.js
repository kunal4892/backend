/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import firebase from "@react-native-firebase/app";

// Optional: verify default app exists
if (!firebase.apps.length) {
  firebase.initializeApp();
}


AppRegistry.registerComponent(appName, () => App);
