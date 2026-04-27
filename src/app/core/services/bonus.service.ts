import { Injectable, inject } from '@angular/core';
import { get, ref } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class BonusService {

  getFinancialYearRange(date: Date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed, April is 3

    let startYear = year;
    if (month < 3) { // January (0), February (1), March (2)
      startYear = year - 1;
    }

    const startDate = new Date(startYear, 3, 1); // April 1st
    const endDate = new Date(startYear + 1, 2, 31); // March 31st

    return { startDate, endDate };
  }

  async getBonusProgress(uid: string) {
    const snap = await get(ref(database, `attendance/${uid}`));
    const allRecords = snap.exists() ? snap.val() as Record<string, AttendanceRecord> : {};
    return this.calculateBonusFromRecords(allRecords);
  }

  calculateBonusFromRecords(allRecords: Record<string, AttendanceRecord>) {
    const { startDate, endDate } = this.getFinancialYearRange();
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(endDate);

    const bonusDays = Object.values(allRecords).filter(rec => {
      if (rec.date < startStr || rec.date > endStr) return false;
      if (rec.status !== 'present') return false;
      const dateObj = new Date(rec.date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      if (dayOfWeek === 0) return false;
      if (!rec.checkIn || !rec.checkOut) return false;

      const inMin = this.toMinutes(rec.checkIn);
      const outMin = this.toMinutes(rec.checkOut);
      const startMin = this.toMinutes('08:00');
      if (inMin > startMin) return false;

      if (dayOfWeek === 6) { // Saturday
        const endMin = this.toMinutes('13:00');
        return outMin >= endMin;
      } else { // Weekday
        const endMin = this.toMinutes('17:00');
        return outMin >= endMin;
      }
    });

    const presentDays = bonusDays.length;
    const requiredDays = 240;
    const pendingDays = Math.max(0, requiredDays - presentDays);
    const isEligible = presentDays >= requiredDays;
    const percentage = Math.min(100, Math.round((presentDays / requiredDays) * 100));

    return {
      presentDays,
      requiredDays,
      pendingDays,
      isEligible,
      startDate,
      endDate,
      percentage
    };
  }

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
