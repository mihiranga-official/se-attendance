import { Injectable, inject } from '@angular/core';
import { get, ref } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class BonusService {
  private readonly HALF_BONUS_THRESHOLD = 200;
  private readonly FULL_BONUS_THRESHOLD = 240;

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
      
      // If it is Saturday Covered, it is automatically eligible for bonus day
      if (rec.status === 'Saturday Covered') return true;
      
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

    // Count virtual Saturday Covered days (where there is no attendance record for that Saturday, but weekday OT is >= 5)
    let virtualSaturdaysCount = 0;
    const startObj = new Date(startDate);
    const todayObj = new Date();
    const endLimit = todayObj < endDate ? todayObj : endDate;
    
    let current = new Date(startObj);
    while (current <= endLimit) {
      if (current.getDay() === 6) { // Saturday
        const dateStr = this.formatDate(current);
        if (!allRecords[dateStr]) {
          const weeklyOT = this.getWeeklyOTFromRecords(allRecords, dateStr);
          if (weeklyOT >= 5) {
            virtualSaturdaysCount++;
          }
        }
      }
      current.setDate(current.getDate() + 1);
    }

    const presentDays = bonusDays.length + virtualSaturdaysCount;

    // Tiered bonus calculation
    const halfBonusEligible = presentDays >= this.HALF_BONUS_THRESHOLD;
    const fullBonusEligible = presentDays >= this.FULL_BONUS_THRESHOLD;

    let currentBonus: 'none' | 'half' | 'full' = 'none';
    if (fullBonusEligible) {
      currentBonus = 'full';
    } else if (halfBonusEligible) {
      currentBonus = 'half';
    }

    const daysUntilHalfBonus = Math.max(0, this.HALF_BONUS_THRESHOLD - presentDays);
    const daysUntilFullBonus = Math.max(0, this.FULL_BONUS_THRESHOLD - presentDays);

    // For backward compatibility
    const requiredDays = this.FULL_BONUS_THRESHOLD;
    const pendingDays = daysUntilFullBonus;
    const isEligible = fullBonusEligible;
    const percentage = Math.min(100, Math.round((presentDays / this.FULL_BONUS_THRESHOLD) * 100));

    return {
      presentDays,
      requiredDays,
      pendingDays,
      isEligible,
      startDate,
      endDate,
      percentage,
      // New tiered fields
      halfBonusThreshold: this.HALF_BONUS_THRESHOLD,
      fullBonusThreshold: this.FULL_BONUS_THRESHOLD,
      halfBonusEligible,
      fullBonusEligible,
      daysUntilHalfBonus,
      daysUntilFullBonus,
      currentBonus
    };
  }

  getWeeklyOTFromRecords(allRecords: Record<string, AttendanceRecord>, dateStr: string): number {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    if (day === 0) return 0;
    
    const monday = new Date(date);
    monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    
    let totalOT = 0;
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = this.formatDate(d);
      if (dStr >= dateStr) break;
      const rec = allRecords[dStr];
      if (rec && rec.otHours) {
        totalOT += rec.otHours;
      }
    }
    return totalOT;
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
