import { Injectable, inject, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { interval, Subscription } from 'rxjs';

export const LUNCH_ORDER_URL = 'https://example.com/order-lunch';

@Injectable({ providedIn: 'root' })
export class LunchAlertService {
  private auth = inject(AuthService);
  private ngZone = inject(NgZone);
  private timerSub?: Subscription;

  startTracking() {
    this.stopTracking();
    
    // Check immediately, then every 1 minute
    this.checkLunchAlert();
    this.ngZone.runOutsideAngular(() => {
      this.timerSub = interval(60000).subscribe(() => {
        this.ngZone.run(() => {
          this.checkLunchAlert();
        });
      });
    });
  }

  stopTracking() {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = undefined;
    }
  }

  private checkLunchAlert() {
    const user = this.auth.currentUser();
    if (!user) return;
    const uid = user.uid;

    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    // Monday to Saturday are 1 to 6
    if (day === 0) return; // Ignore Sunday

    const hours = now.getHours();
    // Must be between 8:00 AM and 9:00 AM (8:00 to 8:59)
    if (hours !== 8) return;

    const todayStr = now.toISOString().split('T')[0];
    const orderedKey = `lunch_ordered_${uid}`;
    const lastCheckKey = `lunch_last_check_${uid}`;

    // If already ordered today, suppress
    if (localStorage.getItem(orderedKey) === todayStr) {
      return;
    }

    // Check throttle (15 minutes = 15 * 60 * 1000 = 900000 ms)
    const lastCheck = localStorage.getItem(lastCheckKey);
    const nowMs = now.getTime();
    if (lastCheck) {
      const lastCheckMs = parseInt(lastCheck, 10);
      if (nowMs - lastCheckMs < 15 * 60 * 1000) {
        return;
      }
    }

    // Set last check timestamp
    localStorage.setItem(lastCheckKey, nowMs.toString());

    // Ask user
    const hasOrdered = confirm(`Did you order today's (${todayStr}) lunch?`);
    if (hasOrdered) {
      localStorage.setItem(orderedKey, todayStr);
    } else {
      window.open(LUNCH_ORDER_URL, '_blank');
    }
  }
}
