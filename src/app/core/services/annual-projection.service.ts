import { Injectable, inject } from '@angular/core';
import { database } from '../firebase.config';
import { ref, get } from 'firebase/database';
import { AttendanceRecord } from '../models/user.model';
import { HolidayService } from './holiday.service';
import { AttendanceService } from './attendance.service';

export interface PoyaHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface AnnualProjectionResult {
  cycleStartDate: string;           // e.g. "2026-04-01"
  cycleEndDate: string;             // e.g. "2027-03-31"
  asOfDate: string;                 // e.g. "2026-10-26"
  targetDays: number;               // 240
  expectedDaysToDate: number;       // Valid working days Apr 1 to asOfDate
  actualDaysLogged: number;         // Attended days recorded in DB
  varianceDays: number;             // actualDaysLogged - expectedDaysToDate
  varianceStatus: 'ahead' | 'behind' | 'on-schedule';
  remainingDaysNeeded: number;      // Math.max(0, 240 - actualDaysLogged)
  completionPercentage: number;     // (actualDaysLogged / 240) * 100 capped at 100 or higher
  projectedCompletionDate: string;  // DD/MM/YYYY or "Target Achieved!"
  projectedCompletionIso: string;   // YYYY-MM-DD or ""
  isTargetMet: boolean;
  sundaysSkippedInProjection: number;
  poyaDaysSkippedInProjection: number;
  futureWorkingDaysCount: number;
}

/** Official Sri Lanka Full Moon Poya Days (2024 - 2029) */
export const SRI_LANKA_POYA_DAYS: PoyaHoliday[] = [
  // 2024
  { date: '2024-01-25', name: 'Duruthu Full Moon Poya Day' },
  { date: '2024-02-23', name: 'Navam Full Moon Poya Day' },
  { date: '2024-03-24', name: 'Medin Full Moon Poya Day' },
  { date: '2024-04-23', name: 'Bak Full Moon Poya Day' },
  { date: '2024-05-23', name: 'Vesak Full Moon Poya Day' },
  { date: '2024-05-24', name: 'Day following Vesak Full Moon Poya Day' },
  { date: '2024-06-21', name: 'Poson Full Moon Poya Day' },
  { date: '2024-07-20', name: 'Esala Full Moon Poya Day' },
  { date: '2024-08-19', name: 'Nikini Full Moon Poya Day' },
  { date: '2024-09-17', name: 'Binara Full Moon Poya Day' },
  { date: '2024-10-17', name: 'Vap Full Moon Poya Day' },
  { date: '2024-11-15', name: 'Il Full Moon Poya Day' },
  { date: '2024-12-14', name: 'Unduvap Full Moon Poya Day' },

  // 2025
  { date: '2025-01-13', name: 'Duruthu Full Moon Poya Day' },
  { date: '2025-02-12', name: 'Navam Full Moon Poya Day' },
  { date: '2025-03-13', name: 'Medin Full Moon Poya Day' },
  { date: '2025-04-12', name: 'Bak Full Moon Poya Day' },
  { date: '2025-05-12', name: 'Vesak Full Moon Poya Day' },
  { date: '2025-05-13', name: 'Day following Vesak Full Moon Poya Day' },
  { date: '2025-06-10', name: 'Poson Full Moon Poya Day' },
  { date: '2025-07-10', name: 'Esala Full Moon Poya Day' },
  { date: '2025-08-08', name: 'Nikini Full Moon Poya Day' },
  { date: '2025-09-07', name: 'Binara Full Moon Poya Day' },
  { date: '2025-10-06', name: 'Vap Full Moon Poya Day' },
  { date: '2025-11-05', name: 'Il Full Moon Poya Day' },
  { date: '2025-12-04', name: 'Unduvap Full Moon Poya Day' },

  // 2026
  { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day' },
  { date: '2026-02-01', name: 'Navam Full Moon Poya Day' },
  { date: '2026-03-03', name: 'Medin Full Moon Poya Day' },
  { date: '2026-04-01', name: 'Bak Full Moon Poya Day' },
  { date: '2026-05-01', name: 'Vesak Full Moon Poya Day' },
  { date: '2026-05-02', name: 'Day following Vesak Full Moon Poya Day' },
  { date: '2026-05-31', name: 'Poson Full Moon Poya Day' },
  { date: '2026-06-29', name: 'Adhi Poson Full Moon Poya Day' },
  { date: '2026-07-28', name: 'Esala Full Moon Poya Day' },
  { date: '2026-08-27', name: 'Nikini Full Moon Poya Day' },
  { date: '2026-09-25', name: 'Binara Full Moon Poya Day' },
  { date: '2026-10-25', name: 'Vap Full Moon Poya Day' },
  { date: '2026-11-23', name: 'Il Full Moon Poya Day' },
  { date: '2026-12-23', name: 'Unduvap Full Moon Poya Day' },

  // 2027
  { date: '2027-01-22', name: 'Duruthu Full Moon Poya Day' },
  { date: '2027-02-20', name: 'Navam Full Moon Poya Day' },
  { date: '2027-03-22', name: 'Medin Full Moon Poya Day' },
  { date: '2027-04-20', name: 'Bak Full Moon Poya Day' },
  { date: '2027-05-20', name: 'Vesak Full Moon Poya Day' },
  { date: '2027-05-21', name: 'Day following Vesak Full Moon Poya Day' },
  { date: '2027-06-19', name: 'Poson Full Moon Poya Day' },
  { date: '2027-07-18', name: 'Esala Full Moon Poya Day' },
  { date: '2027-08-17', name: 'Nikini Full Moon Poya Day' },
  { date: '2027-09-15', name: 'Binara Full Moon Poya Day' },
  { date: '2027-10-15', name: 'Vap Full Moon Poya Day' },
  { date: '2027-11-13', name: 'Il Full Moon Poya Day' },
  { date: '2027-12-13', name: 'Unduvap Full Moon Poya Day' },

  // 2028
  { date: '2028-01-11', name: 'Duruthu Full Moon Poya Day' },
  { date: '2028-02-10', name: 'Navam Full Moon Poya Day' },
  { date: '2028-03-10', name: 'Medin Full Moon Poya Day' },
  { date: '2028-04-09', name: 'Bak Full Moon Poya Day' },
  { date: '2028-05-08', name: 'Vesak Full Moon Poya Day' },
  { date: '2028-05-09', name: 'Day following Vesak Full Moon Poya Day' },
  { date: '2028-06-07', name: 'Poson Full Moon Poya Day' },
  { date: '2028-07-06', name: 'Esala Full Moon Poya Day' },
  { date: '2028-08-05', name: 'Nikini Full Moon Poya Day' },
  { date: '2028-09-03', name: 'Binara Full Moon Poya Day' },
  { date: '2028-10-03', name: 'Vap Full Moon Poya Day' },
  { date: '2028-11-01', name: 'Il Full Moon Poya Day' },
  { date: '2028-12-01', name: 'Unduvap Full Moon Poya Day' },
  { date: '2028-12-30', name: 'Duruthu Full Moon Poya Day' },

  // 2029
  { date: '2029-01-29', name: 'Duruthu Full Moon Poya Day' },
  { date: '2029-02-27', name: 'Navam Full Moon Poya Day' },
  { date: '2029-03-29', name: 'Medin Full Moon Poya Day' },
  { date: '2029-04-27', name: 'Bak Full Moon Poya Day' },
  { date: '2029-05-27', name: 'Vesak Full Moon Poya Day' },
  { date: '2029-06-25', name: 'Poson Full Moon Poya Day' },
  { date: '2029-07-25', name: 'Esala Full Moon Poya Day' },
  { date: '2029-08-23', name: 'Nikini Full Moon Poya Day' },
  { date: '2029-09-22', name: 'Binara Full Moon Poya Day' },
  { date: '2029-10-22', name: 'Vap Full Moon Poya Day' },
  { date: '2029-11-20', name: 'Il Full Moon Poya Day' },
  { date: '2029-12-20', name: 'Unduvap Full Moon Poya Day' }
];

@Injectable({ providedIn: 'root' })
export class AnnualProjectionService {
  private holidaySvc = inject(HolidayService);
  private attendanceSvc = inject(AttendanceService);

  /** Map of built-in Poya dates */
  private poyaMap = new Map<string, string>(
    SRI_LANKA_POYA_DAYS.map(p => [p.date, p.name])
  );

  /** Check if a date string (YYYY-MM-DD) is a Sri Lankan Full Moon Poya day */
  isPoyaDay(dateStr: string): boolean {
    if (this.poyaMap.has(dateStr)) return true;
    // Also check if any custom holiday in HolidayService has 'poya' in its name
    const holidayName = this.holidaySvc.getHolidayName(dateStr);
    if (holidayName && holidayName.toLowerCase().includes('poya')) {
      return true;
    }
    return false;
  }

  /**
   * Helper function to supply or fetch all Poya days
   */
  getPoyaDays(): PoyaHoliday[] {
    return [...SRI_LANKA_POYA_DAYS];
  }

  /**
   * Determine the official annual cycle start and end dates.
   * Cycle starts April 1st of each year:
   * - If month >= 4 (April - December): starts April 1st of current year.
   * - If month < 4 (January - March): starts April 1st of previous year.
   */
  getAnnualCycleDates(referenceDate: Date = new Date()): { startDate: string; endDate: string } {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth() + 1; // 1-12
    const startYear = month >= 4 ? year : year - 1;
    const endYear = startYear + 1;

    return {
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`
    };
  }

  /**
   * Checks whether a specific date is a valid standard work day according to business rules:
   * - Monday to Friday: 8:00 AM – 5:00 PM (Full working day) -> Valid
   * - Saturday: 8:00 AM – 1:00 PM -> Valid
   * - Sunday: Excluded -> Invalid
   * - Sri Lankan full moon Poya days: Excluded -> Invalid
   * - (Optional) Other public holidays can also be checked
   */
  isValidWorkingDay(dateObj: Date, excludePoyaOnly: boolean = false): boolean {
    // Sundays are excluded
    if (dateObj.getDay() === 0) {
      return false;
    }

    const dateStr = this.formatDateIso(dateObj);

    // Sri Lankan full moon Poya days are excluded
    if (this.isPoyaDay(dateStr)) {
      return false;
    }

    // If considering all public holidays in DB
    if (!excludePoyaOnly && this.holidaySvc.isHoliday(dateStr)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate Expected Working Days between two dates (inclusive)
   */
  countExpectedWorkingDays(startDateStr: string, endDateStr: string, excludePoyaOnly: boolean = false): number {
    if (startDateStr > endDateStr) return 0;

    let count = 0;
    const cur = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T00:00:00');

    while (cur.getTime() <= end.getTime()) {
      if (this.isValidWorkingDay(cur, excludePoyaOnly)) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }

    return count;
  }

  /**
   * Core Calculation & Projection Method
   * @param uid User ID
   * @param targetDays Mandatory target working days (Default: 240)
   * @param asOfDate Current date reference (Default: today)
   */
  async calculateAnnualProjection(
    uid: string,
    targetDays: number = 240,
    asOfDate: Date = new Date()
  ): Promise<AnnualProjectionResult> {
    await this.holidaySvc.ensureLoaded();

    const asOfStr = this.formatDateIso(asOfDate);
    const { startDate: cycleStartDate, endDate: cycleEndDate } = this.getAnnualCycleDates(asOfDate);

    // Edge case: asOfDate is earlier than cycle start date (future start)
    const effectiveStart = cycleStartDate;
    const effectiveAsOf = asOfStr < cycleStartDate ? cycleStartDate : asOfStr;

    // 1. Expected Days to Date (from April 1st to asOfDate inclusive, skipping Sundays and Poya days)
    const expectedDaysToDate = this.countExpectedWorkingDays(effectiveStart, effectiveAsOf, false);

    // 2. Fetch actual logged attendance from Database
    const recordsSnap = await get(ref(database, `attendance/${uid}`));
    let actualDaysLogged = 0;

    if (recordsSnap.exists()) {
      const recordsMap = recordsSnap.val() as Record<string, AttendanceRecord>;
      const relevantRecords = Object.values(recordsMap).filter(r => 
        r.date >= effectiveStart && r.date <= effectiveAsOf
      );

      for (const rec of relevantRecords) {
        actualDaysLogged += this.attendanceSvc.getFullDaysEarned(rec);
      }
    }

    // 3. Attendance Variance (ahead / behind schedule)
    const varianceDays = Math.round(actualDaysLogged - expectedDaysToDate);
    let varianceStatus: 'ahead' | 'behind' | 'on-schedule' = 'on-schedule';
    if (varianceDays > 0) varianceStatus = 'ahead';
    else if (varianceDays < 0) varianceStatus = 'behind';

    // 4. Remaining Days Needed
    const remainingDaysNeeded = Math.max(0, Math.round(targetDays - actualDaysLogged));
    const completionPercentage = parseFloat(Math.min(100, (actualDaysLogged / targetDays) * 100).toFixed(1));
    const isTargetMet = remainingDaysNeeded === 0;

    // 5. Projected Completion Date Calculation:
    // "Starting from the next working day, count forward sequentially until the remaining required days are satisfied,
    // skipping all sundays, Poya days, only."
    let projectedCompletionDate = 'Target Achieved!';
    let projectedCompletionIso = '';
    let sundaysSkippedInProjection = 0;
    let poyaDaysSkippedInProjection = 0;
    let futureWorkingDaysCount = 0;

    if (isTargetMet) {
      projectedCompletionDate = 'Target Met (240 Days Completed)';
      projectedCompletionIso = asOfStr;
    } else {
      let daysRemaining = remainingDaysNeeded;
      const scanDate = new Date(asOfDate.getTime());
      // Start from the next day
      scanDate.setDate(scanDate.getDate() + 1);

      // Loop forward day by day until remaining days are satisfied
      // Guard against infinite loop with max 1000 days
      let safetyCounter = 0;
      while (daysRemaining > 0 && safetyCounter < 1200) {
        safetyCounter++;
        const dayOfWeek = scanDate.getDay();
        const dateIso = this.formatDateIso(scanDate);

        if (dayOfWeek === 0) {
          // Skip Sundays
          sundaysSkippedInProjection++;
        } else if (this.isPoyaDay(dateIso)) {
          // Skip Poya days
          poyaDaysSkippedInProjection++;
        } else {
          // Valid working day (Mon-Fri or Saturday)
          futureWorkingDaysCount++;
          daysRemaining = Math.max(0, daysRemaining - 1.0);
          
          if (daysRemaining <= 0) {
            projectedCompletionIso = dateIso;
            projectedCompletionDate = this.formatDateDmy(scanDate);
            break;
          }
        }

        scanDate.setDate(scanDate.getDate() + 1);
      }
    }

    return {
      cycleStartDate,
      cycleEndDate,
      asOfDate: asOfStr,
      targetDays,
      expectedDaysToDate,
      actualDaysLogged: Math.round(actualDaysLogged),
      varianceDays,
      varianceStatus,
      remainingDaysNeeded,
      completionPercentage,
      projectedCompletionDate,
      projectedCompletionIso,
      isTargetMet,
      sundaysSkippedInProjection,
      poyaDaysSkippedInProjection,
      futureWorkingDaysCount
    };
  }

  private formatDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatDateDmy(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }
}
