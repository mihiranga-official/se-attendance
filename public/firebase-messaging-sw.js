// Import and configure the Firebase SDK
// These scripts are made available when the app is served or deployed on Firebase Hosting
// If not on Firebase Hosting, you must download and serve them yourself
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI",
  authDomain: "he-and-she-356f5.firebaseapp.com",
  databaseURL: "https://he-and-she-356f5-default-rtdb.firebaseio.com",
  projectId: "he-and-she-356f5",
  storageBucket: "he-and-she-356f5.firebasestorage.app",
  messagingSenderId: "473533416830",
  appId: "1:473533416830:web:3e5c32c0588c60b3dc9f2f"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || 'Attendance Reminder';
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/assets/icons/icon-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
