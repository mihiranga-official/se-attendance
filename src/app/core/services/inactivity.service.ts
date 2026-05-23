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
  private stop$ = new Subject<void>();

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
        this.resetTimer();
      });

      this.resetTimer();
    });
  }

  stopTracking() {
    this.stop$.next();
    this.showWarning.set(false);
  }

  private resetTimer() {
    this.ngZone.run(() => {
      this.showWarning.set(false);
      
      // Start the main inactivity timer
      timer(this.TIMEOUT_MS).pipe(takeUntil(this.stop$)).subscribe(() => {
        this.onTimeoutReached();
      });
    });
  }

  private onTimeoutReached() {
    this.showWarning.set(true);
    
    // Start warning timer
    timer(this.WARNING_MS).pipe(takeUntil(this.stop$)).subscribe(() => {
      if (this.showWarning()) {
        this.stopTracking();
        this.auth.logout();
      }
    });
  }

  stayLoggedIn() {
    this.resetTimer();
  }
}
