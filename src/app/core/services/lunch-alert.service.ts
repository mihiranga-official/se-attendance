import { Injectable, inject, NgZone, effect } from '@angular/core';
import { AuthService } from './auth.service';
import { Router } from '@angular/router';
import { interval, Subscription, firstValueFrom } from 'rxjs';
import { CustomDialogService } from './custom-dialog.service';
import { AttendanceService } from './attendance.service';

@Injectable({ providedIn: 'root' })
export class LunchAlertService {
  private auth = inject(AuthService);
  private ngZone = inject(NgZone);
  private router = inject(Router);
  private dialog = inject(CustomDialogService);
  private attendanceSvc = inject(AttendanceService);
  private timerSub?: Subscription;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      const profile = this.auth.userProfile();
      if (user && profile) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
          Notification.requestPermission();
        }
        this.checkLunchAlert();
      }
    });
  }

  startTracking() {
    this.stopTracking();
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

  private async checkLunchAlert() {
    if (this.dialog.show()) return; // Don't trigger if a dialog is already open

    const user = this.auth.currentUser();
    if (!user) return;
    
    const profile = this.auth.userProfile();
    if (!profile || profile.role === 'admin') return;

    const uid = user.uid;
    
    // Enforce Asia/Colombo time to ensure correct timezone evaluation
    const colomboTimeStr = new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" });
    const now = new Date(colomboTimeStr);
    
    const day = now.getDay();
    if (day === 0) return;

    const hours = now.getHours();
    const minutes = now.getMinutes();
    
    // Window is strictly 7:30 AM to 8:59 AM
    if (hours < 7 || hours >= 9) return;
    if (hours === 7 && minutes < 30) return;

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const orderedKey = `lunch_ordered_${uid}`;
    
    if (localStorage.getItem(orderedKey) === todayStr) {
      return;
    }

    const slot = Math.floor(minutes / 15);
    const slotKey = `lunch_slot_${uid}_${todayStr}_${hours}_${slot}`;
    if (localStorage.getItem(slotKey)) {
      return;
    }

    localStorage.setItem(slotKey, '1');

    if (Notification.permission === 'granted') {
      new Notification('Lunch Order Reminder', { body: `Did you order today's (${todayStr}) lunch?` });
    }

    const hasOrdered = await this.dialog.confirm('Lunch Order', `Did you order today's (${todayStr}) lunch?`);
    if (hasOrdered) {
      const requests = await firstValueFrom(this.attendanceSvc.getFoodRequests());
      const ordered = requests.some(r => r.name === profile.name && r.dateTime.startsWith(todayStr));
      
      if (!ordered) {
        await this.dialog.confirm('Verification Failed', 'You did not order. Routing to request page...');
        this.router.navigate(['/food-request']);
      } else {
        localStorage.setItem(orderedKey, todayStr);
      }
    } else {
      this.router.navigate(['/food-request']);
    }
  }
}
