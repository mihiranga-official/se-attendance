import { Injectable } from '@angular/core';
import { database } from '../firebase.config';
import { ref, get, set, remove, onValue } from 'firebase/database';
import { signal } from '@angular/core';

export interface PublicHoliday {
  date: string;   // YYYY-MM-DD
  name: string;   // e.g. "Vesak Full Moon Poya Day"
}

@Injectable({ providedIn: 'root' })
export class HolidayService {

  /** Reactive cache — loaded once, used everywhere */
  private _holidays = signal<PublicHoliday[]>([]);
  readonly holidays = this._holidays.asReadonly();

  private loadedPromise: Promise<void> | null = null;
  private resolveLoaded: (() => void) | null = null;

  constructor() {
    this.loadedPromise = new Promise((resolve) => {
      this.resolveLoaded = resolve;
    });

    // Subscribe to Firebase holidays node in real-time
    onValue(ref(database, 'holidays'), (snap) => {
      if (!snap.exists()) {
        this._holidays.set([]);
      } else {
        const raw = snap.val() as Record<string, string>; // date -> name
        const list: PublicHoliday[] = Object.entries(raw).map(([date, name]) => ({ date, name }));
        list.sort((a, b) => a.date.localeCompare(b.date));
        this._holidays.set(list);
      }
      if (this.resolveLoaded) {
        this.resolveLoaded();
        this.resolveLoaded = null; // resolve once
      }
    });
  }

  /** Await this promise to ensure holidays are fully loaded from Firebase */
  async ensureLoaded(): Promise<void> {
    if (this.loadedPromise) {
      await this.loadedPromise;
    }
  }


  /** Check if a given date string (YYYY-MM-DD) is a public holiday */
  isHoliday(dateStr: string): boolean {
    return this._holidays().some(h => h.date === dateStr);
  }

  /** Get holiday name for a date, or null */
  getHolidayName(dateStr: string): string | null {
    return this._holidays().find(h => h.date === dateStr)?.name ?? null;
  }

  /** Admin: Add or update a public holiday */
  async setHoliday(date: string, name: string): Promise<void> {
    await set(ref(database, `holidays/${date}`), name);
  }

  /** Admin: Remove a public holiday */
  async removeHoliday(date: string): Promise<void> {
    await remove(ref(database, `holidays/${date}`));
  }

  /** Get all holidays for a specific month */
  getHolidaysForMonth(year: number, month: number): PublicHoliday[] {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this._holidays().filter(h => h.date.startsWith(prefix));
  }
}
