import { Injectable, inject } from '@angular/core';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, database } from '../firebase.config';
import { ref, update } from 'firebase/database';

@Injectable({
  providedIn: 'root'
})
export class FcmService {
  // Replace with your actual VAPID key from Firebase Console -> Project Settings -> Cloud Messaging -> Web configuration
  private vapidKey = 'BK8FrX0vWZIFusQIOWOn3T9X4xUSiVTrzfiNTjdLwJk-KIXhgYrQkMPiAwLg47ubaUck7EecaB44cZGDTGwaKK4';

  constructor() {
    this.listenForMessages();
  }

  async requestPermissionAndGetToken(uid: string) {
    if (!messaging) return; // Not supported or SSR

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const token = await getToken(messaging, { vapidKey: this.vapidKey });
        if (token) {
          // console.log('FCM Token retrieved:', token);
          await this.saveTokenToDatabase(uid, token);
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      } else {
        console.warn('Notification permission not granted.');
      }
    } catch (err) {
      console.error('An error occurred while retrieving token. ', err);
    }
  }

  private async saveTokenToDatabase(uid: string, token: string) {
    try {
      const userRef = ref(database, `users/${uid}`);
      await update(userRef, { fcmToken: token });
      console.log('FCM Token saved to database successfully.');
    } catch (error) {
      console.error('Failed to save FCM token to database:', error);
    }
  }

  listenForMessages() {
    if (!messaging) return;

    onMessage(messaging, (payload) => {
      console.log('Message received. ', payload);

      // Customize notification here if site is open
      const notificationTitle = payload.notification?.title || 'Attendance Reminder';
      const notificationOptions = {
        body: payload.notification?.body,
        icon: payload.notification?.icon || '/assets/icons/icon-192x192.png'
      };

      if (Notification.permission === 'granted') {
        new Notification(notificationTitle, notificationOptions);
      }
    });
  }
}
