import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getMessaging } from 'firebase/messaging';
import { getFunctions } from 'firebase/functions';

// Replace with your actual Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI",
  authDomain: "he-and-she-356f5.firebaseapp.com",
  databaseURL: "https://he-and-she-356f5-default-rtdb.firebaseio.com",
  projectId: "he-and-she-356f5",
  storageBucket: "he-and-she-356f5.firebasestorage.app",
  messagingSenderId: "473533416830",
  appId: "1:473533416830:web:3e5c32c0588c60b3dc9f2f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app, firebaseConfig.databaseURL);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;
export const functions = getFunctions(app); // Defaults to us-central1
