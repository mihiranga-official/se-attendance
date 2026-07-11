import { Injectable, signal } from '@angular/core';
import { database } from '../firebase.config';
import { ref, set, update, push, onValue, off } from 'firebase/database';

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'event' | 'general' | 'system';
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private _notifications = signal<InAppNotification[]>([]);
  readonly notifications = this._notifications.asReadonly();
  
  private activeListenerUid: string | null = null;
  private dbRef: any = null;

  /** Listen to a user's notifications in real-time */
  listenToNotifications(uid: string) {
    if (this.activeListenerUid === uid) return;
    this.stopListening();

    this.activeListenerUid = uid;
    this.dbRef = ref(database, `users/${uid}/notifications`);

    onValue(this.dbRef, (snap) => {
      if (!snap.exists()) {
        this._notifications.set([]);
      } else {
        const raw = snap.val() as Record<string, InAppNotification>;
        const list: InAppNotification[] = Object.entries(raw).map(([id, item]) => ({
          ...item,
          id
        }));
        // Sort newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        this._notifications.set(list);
      }
    }, (err) => {
      console.error('NotificationService listener error:', err);
    });
  }

  /** Stop listening to notification changes */
  stopListening() {
    if (this.dbRef) {
      off(this.dbRef);
      this.dbRef = null;
    }
    this.activeListenerUid = null;
    this._notifications.set([]);
  }

  /** Send a new notification to a specific user */
  async sendNotification(uid: string, title: string, message: string, type: 'event' | 'general' | 'system' = 'general'): Promise<void> {
    const notifRef = ref(database, `users/${uid}/notifications`);
    const newNotifRef = push(notifRef);
    const newNotif: Partial<InAppNotification> = {
      title,
      message,
      timestamp: Date.now(),
      read: false,
      type
    };
    await set(newNotifRef, newNotif);
  }

  /** Mark a notification as read */
  async markAsRead(uid: string, notificationId: string): Promise<void> {
    const path = `users/${uid}/notifications/${notificationId}`;
    await update(ref(database, path), { read: true });
  }

  /** Mark all notifications as read */
  async markAllAsRead(uid: string): Promise<void> {
    const notifs = this._notifications();
    const updates: Record<string, any> = {};
    notifs.forEach(n => {
      if (!n.read) {
        updates[`users/${uid}/notifications/${n.id}/read`] = true;
      }
    });
    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
    }
  }

  /** Delete a single notification */
  async clearNotification(uid: string, notificationId: string): Promise<void> {
    const path = `users/${uid}/notifications/${notificationId}`;
    await set(ref(database, path), null);
  }

  /** Delete all notifications for a user */
  async clearAll(uid: string): Promise<void> {
    const path = `users/${uid}/notifications`;
    await set(ref(database, path), null);
  }
}
