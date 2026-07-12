import { Injectable, inject, signal, NgZone } from '@angular/core';
import { AuthService } from './auth.service';
import { fromEvent, merge, throttleTime, Subject, timer, takeUntil } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class InactivityService {
  private auth = inject(AuthService);
  private ngZone = inject(NgZone);
  
  private readonly TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly WARNING_MS = 30 * 1000; // 30 seconds to respond
  
  showWarning = signal(false);
  countdown = signal(30);
  private stop$ = new Subject<void>();
  private timerStop$ = new Subject<void>();
  private countdownInterval: any = null;

  startTracking() {
    this.stop$.next(); // Reset if already running
    
    this.ngZone.runOutsideAngular(() => {
      const activity$ = merge(
        fromEvent(window, 'mousemove'),
        fromEvent(window, 'keydown'),
        fromEvent(window, 'click'),
        fromEvent(window, 'touchstart')
      ).pipe(
        throttleTime(5000) // Only react every 5 seconds
      );

      activity$.pipe(takeUntil(this.stop$)).subscribe(() => {
        this.ngZone.run(() => {
          this.stayLoggedIn();
        });
      });

      this.resetTimer();
    });
  }

  stopTracking() {
    this.stop$.next();
    this.timerStop$.next();
    this.showWarning.set(false);
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private resetTimer() {
    this.ngZone.run(() => {
      this.showWarning.set(false);
      this.timerStop$.next(); // Cancel previous timer subscription
      
      // Start the main inactivity timer
      timer(this.TIMEOUT_MS).pipe(takeUntil(merge(this.stop$, this.timerStop$))).subscribe(() => {
        this.onTimeoutReached();
      });
    });
  }

  private onTimeoutReached() {
    this.countdown.set(30);
    this.showWarning.set(true);
    
    this.ngZone.run(() => {
      if (this.countdownInterval) clearInterval(this.countdownInterval);
      this.countdownInterval = setInterval(() => {
        this.ngZone.run(() => {
          const val = this.countdown();
          if (val > 1) {
            this.countdown.set(val - 1);
          } else {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
            this.stopTracking();
            this.auth.logout();
          }
        });
      }, 1000);
    });
  }

  stayLoggedIn() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.resetTimer();
  }
}
