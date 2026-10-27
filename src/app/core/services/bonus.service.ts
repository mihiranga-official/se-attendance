import { Injectable, inject } from '@angular/core';
import { get, ref } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';
import { HolidayService } from './holiday.service';
import { AttendanceService } from './attendance.service';

@Injectable({ providedIn: 'root' })
export class BonusService {
  private holidaySvc = inject(HolidayService);
  private attendanceSvc = inject(AttendanceService);
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

  async getBonusProgress(uid: string, targetDate: Date = new Date()) {
    await this.holidaySvc.ensureLoaded();
    const snap = await get(ref(database, `attendance/${uid}`));
    const allRecords = snap.exists() ? snap.val() as Record<string, AttendanceRecord> : {};
    return this.calculateBonusFromRecords(allRecords, targetDate);
  }

  calculateBonusFromRecords(allRecords: Record<string, AttendanceRecord>, targetDate: Date = new Date()) {
    const { startDate, endDate } = this.getFinancialYearRange();
    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(endDate);

    let presentDays = 0;
    for (const rec of Object.values(allRecords)) {
      if (rec.date < startStr || rec.date > endStr) continue;
      presentDays += this.attendanceSvc.getFullDaysEarned(rec);
    }

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

    // Dynamic Monthly Target based on the current month's calendar days and public holidays
    const currentYear = targetDate.getFullYear();
    const currentMonth = targetDate.getMonth() + 1;
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    let currentMonthWorkingDays = 0;
    let currentMonthHolidays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
      if (dayOfWeek === 0) continue; // Sunday off
      if (this.holidaySvc.isHoliday(dateStr)) {
        currentMonthHolidays++;
        continue;
      }
      currentMonthWorkingDays++;
    }

    // Benchmark ratio: 20 days required in a standard 25 working-day month (0.80)
    // Half bonus: 16.7 days required in a standard 25 working-day month (~0.667)
    const monthlyFullTarget = parseFloat((currentMonthWorkingDays * 0.8).toFixed(1));
    const monthlyHalfTarget = parseFloat((currentMonthWorkingDays * (16.7 / 25.0)).toFixed(1));
    const monthName = targetDate.toLocaleDateString('en-US', { month: 'long' });

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
      currentBonus,
      // Dynamic monthly targets
      currentMonthWorkingDays,
      currentMonthHolidays,
      monthName,
      monthlyFullTarget,
      monthlyHalfTarget
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
