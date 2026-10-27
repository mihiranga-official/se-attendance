import { Injectable, inject } from '@angular/core';
import { ref, set, get, update, remove, onValue } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';
import { Observable, of, from } from 'rxjs';
import { HolidayService } from './holiday.service';



const WORK_START = '08:00';
const WORK_END = '17:00';
const SATURDAY_END = '13:00';

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private holidaySvc = inject(HolidayService);

  toMinutes(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private toHours(minutes: number): number {
    return parseFloat((minutes / 60).toFixed(2));
  }

  /**
   * Rule 9: Calculates evening OT minutes between startMin and outMin,
   * strictly excluding 21:00–22:00 (9:00 PM to 10:00 PM) as non-OT (dinner / night break).
   * After 22:00 (10:00 PM), OT resumes.
   */
  calculateEveningOtMinutes(startMin: number, outMin: number): number {
    if (outMin <= startMin) return 0;
    const breakStartMin = 21 * 60; // 21:00 (1260 min)
    const breakEndMin = 22 * 60;   // 22:00 (1320 min)

    // Segment 1: from startMin up to min(outMin, 21:00)
    const beforeBreak = Math.max(0, Math.min(outMin, breakStartMin) - startMin);

    // Segment 2: between 21:00 and 22:00 is NOT OT (0 min)

    // Segment 3: after 22:00 (10:00 PM) resumes OT
    const afterBreak = outMin > breakEndMin ? (outMin - breakEndMin) : 0;

    return beforeBreak + afterBreak;
  }

  /**
   * Rule 9: Calculates overnight morning OT minutes on Day 2 up to 08:00 AM,
   * strictly excluding 07:00–08:00 AM (420 to 480 min) as non-OT (morning break).
   */
  calculateMorningOvernightOtMinutes(outMin: number): number {
    if (outMin <= 0) return 0;
    const morningBreakStart = 7 * 60; // 07:00 (420 min)

    // From 00:00 up to min(outMin, 07:00) is OT
    // Time between 07:00 and 08:00 is NOT OT
    return Math.min(outMin, morningBreakStart);
  }

  getDayType(dateStr: string): 'weekday' | 'saturday' | 'sunday' {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    if (day === 0) return 'sunday';
    if (day === 6) return 'saturday';
    return 'weekday';
  }

  /**
   * Calculates the attended days for standard working days (0, 0.5, 1, or 2):
   * - Present full day (whether on-time or late arrival): 1 day
   * - Half day: 0.5 day
   * - 24-hour shift across 2 days: 2 days (unless Day 1 or Day 2 is Sunday)
   * - Saturday Covered: 1 day
   * - Absent / no check-in: 0 days
   */
  getAttendedDaysEarned(record: Partial<AttendanceRecord>): number {
    if (!record || record.status === 'absent') return 0;
    if (record.status === 'Saturday Covered') return 1;
    if (!record.checkIn) return 0;

    const day1Date = record.checkInDate || record.date;
    if (!day1Date) return 0;
    const day1Obj = new Date(day1Date + 'T00:00:00');
    const day1DayOfWeek = day1Obj.getDay();
    const isDay1Sunday = day1DayOfWeek === 0;
    const isDay1Holiday = this.holidaySvc.isHoliday(day1Date);

    // Rule 3: Sundays and Admin Public Holidays are excluded from regular working days
    if (isDay1Sunday || isDay1Holiday) return 0;

    const is24h = !!(record.is24HourShift && record.checkInDate && record.checkOutDate && record.checkInDate !== record.checkOutDate);

    if (is24h) {
      let days = 0;
      if (!isDay1Sunday && !isDay1Holiday) days += 1;
      if (record.checkOutDate && record.checkOut) {
        const day2Obj = new Date(record.checkOutDate + 'T00:00:00');
        const isDay2Sunday = day2Obj.getDay() === 0;
        const isDay2Holiday = this.holidaySvc.isHoliday(record.checkOutDate);
        if (!isDay2Sunday && !isDay2Holiday) {
          const isDay2Sat = day2Obj.getDay() === 6;
          const threshold = isDay2Sat ? this.toMinutes(SATURDAY_END) : this.toMinutes(WORK_END);
          const outMin = this.toMinutes(record.checkOut);
          // Rule 4: If user leaves before 5 PM (or 1 PM on Sat) on Day 2, Day 2 full day is lost
          if (outMin >= threshold) {
            days += 1;
          }
        }
      }
      return days;
    }

    if (record.actualStatus === 'Half Day' || record.status === 'half-day') {
      return 0.5;
    }
    if (record.actualStatus === 'Incomplete' && record.checkOut) {
      return 0;
    }

    return 1;
  }

  /**
   * Calculates the exact number of full working days earned for an attendance record (0, 1, or 2):
   * Business Rules:
   * 1. Must check in on or before 08:00 AM (inMin <= 480). Late arrivals do not count as a day.
   * 2. Regular Weekdays (Mon-Fri): Must check out at or after 17:00 (5:00 PM, outMin >= 1020).
   * 3. Regular Saturdays: Must check out at or after 13:00 (1:00 PM, outMin >= 780).
   * 4. Sundays & Admin Holidays: Excluded from regular working day counts (all hours are OT).
   * 5. 24-Hour / Overnight Shifts:
   *    - Day 1: Earns 1 full day IF check-in was on or before 08:00 AM (and not Sunday/Holiday).
   *    - Day 2: Earns an additional 1 full day ONLY IF check-out on Day 2 is at or after 17:00
   *      (or 13:00 if Day 2 is Saturday). If left earlier, Day 2 full day is lost!
   * 6. Strictly NO fractional / half days. Only full days count!
   */
  getFullDaysEarned(record: Partial<AttendanceRecord>): number {
    if (!record || record.status === 'absent') return 0;
    if (record.status === 'Saturday Covered') return 1;
    if (!record.checkIn) return 0;

    const inMin = this.toMinutes(record.checkIn);
    // Post-overnight rest feature: If user worked an overnight shift ending early morning on this day,
    // allowed arrival is on or before 09:00 AM (540 min). Otherwise standard 08:00 AM (480 min).
    const startMin = record.isPostOvernightShift ? this.toMinutes('09:00') : this.toMinutes(WORK_START);

    // Day 1: Must arrive on or before startMin (Rule 1 & 2)
    const day1OnTime = inMin <= startMin;

    const day1Date = record.checkInDate || record.date;
    if (!day1Date) return 0;

    const day1Obj = new Date(day1Date + 'T00:00:00');
    const day1DayOfWeek = day1Obj.getDay();
    const isDay1Sunday = day1DayOfWeek === 0;
    const isDay1Holiday = this.holidaySvc.isHoliday(day1Date);

    const is24h = !!(record.is24HourShift && record.checkInDate && record.checkOutDate && record.checkInDate !== record.checkOutDate);

    if (!is24h) {
      // Rule 3: Sundays and Admin Public Holidays are excluded from regular working days
      if (isDay1Sunday || isDay1Holiday) return 0;
      if (!record.checkOut) return 0;
      if (!day1OnTime) return 0; // Late arrival does NOT earn a full day

      const outMin = this.toMinutes(record.checkOut);
      if (day1DayOfWeek === 6) {
        // Rule 2 & 7: Saturday must checkout at or after 13:00 (1:00 PM)
        return outMin >= this.toMinutes(SATURDAY_END) ? 1 : 0;
      } else {
        // Rule 1, 6 & 8: Weekday must checkout at or after 17:00 (5:00 PM)
        return outMin >= this.toMinutes(WORK_END) ? 1 : 0;
      }
    } else {
      // Rule 4: 24-Hour Shift across two calendar days
      let daysEarned = 0;

      // Day 1: Earns 1 full day if Day 1 is regular working day (not Sunday/Holiday) and arrived on time
      if (!isDay1Sunday && !isDay1Holiday && day1OnTime) {
        daysEarned += 1;
      }

      // Day 2:
      if (record.checkOut && record.checkOutDate) {
        const outDateObj = new Date(record.checkOutDate + 'T00:00:00');
        const day2DayOfWeek = outDateObj.getDay();
        const isDay2Sunday = day2DayOfWeek === 0;
        const isDay2Holiday = this.holidaySvc.isHoliday(record.checkOutDate);

        // Day 2 must not be Sunday or Holiday
        if (!isDay2Sunday && !isDay2Holiday) {
          const outMin = this.toMinutes(record.checkOut);
          const day2ThresholdMin = day2DayOfWeek === 6 
            ? this.toMinutes(SATURDAY_END) 
            : this.toMinutes(WORK_END);
          
          // Rule 4: Day 2 only earns a full working day IF staying until 17:00 (or 13:00 on Sat) or after!
          // Otherwise Day 2 full day is lost!
          if (outMin >= day2ThresholdMin) {
            daysEarned += 1;
          }
        }
      }

      return daysEarned;
    }
  }

  calculateHoursAndStatus(record: Partial<AttendanceRecord>): void {
    if (!record.checkIn) {
      record.actualStatus = 'Incomplete';
      return;
    }

    const inMin = this.toMinutes(record.checkIn);
    // Post-overnight rest feature: allows arrival on or before 09:00 AM if following an overnight shift
    const startMin = record.isPostOvernightShift ? this.toMinutes('09:00') : this.toMinutes(WORK_START);
    const checkInDate = record.checkInDate || record.date || '';
    const checkOutDate = record.checkOutDate || record.date || '';
    const dayType = checkInDate ? this.getDayType(checkInDate) : 'weekday';
    const isPublicHoliday = checkInDate ? this.holidaySvc.isHoliday(checkInDate) : false;
    const isSundayOrHoliday = dayType === 'sunday' || isPublicHoliday;

    // 1. Calculate Late Status (Rules 1, 2, 3)
    // Sundays and Admin Public Holidays are not regular working days: late violation does not apply.
    if (!isSundayOrHoliday && inMin > startMin) {
      record.isLate = true;
      record.lateMinutes = inMin - startMin;
      record.lostBonus = true;
      record.lostFullDay = true;
      if (dayType === 'saturday') {
        record.isSaturdayViolation = true;
      }
    } else {
      record.isLate = false;
      record.lateMinutes = 0;
      record.lostBonus = isSundayOrHoliday; // Sundays & holidays do not earn regular bonus days
      record.lostFullDay = false;
      record.isSaturdayViolation = false;
    }

    // 2. 24H Shift Setup
    if (record.shiftType === '24h') {
      record.is24HourShift = true;
      record.breakfastEligible = true;
      record.nextDayLunchEligible = true;
    } else {
      record.is24HourShift = false;
      record.breakfastEligible = false;
      record.nextDayLunchEligible = false;
    }

    if (!record.checkOut) {
      record.workedHours = 0;
      record.otHours = 0;
      if (isSundayOrHoliday) {
        record.actualStatus = dayType === 'sunday' ? 'Sunday Work' : 'Holiday Work';
      } else {
        record.actualStatus = record.isLate ? 'Late Arrival' : 'Incomplete';
      }
      return;
    }

    // 3. Calculate Worked Hours
    // Cap working hours starting time at 08:00 AM (or 09:00 AM if post-overnight) for early check-ins
    let calcCheckIn = record.checkIn;
    const baseStart = record.isPostOvernightShift ? '09:00' : WORK_START;
    if (calcCheckIn && this.toMinutes(calcCheckIn) < this.toMinutes(baseStart)) {
      calcCheckIn = baseStart;
    }

    const startDt = new Date(`${checkInDate}T${calcCheckIn}`);
    const endDt = new Date(`${checkOutDate}T${record.checkOut}`);
    
    let totalWorked = Math.floor((endDt.getTime() - startDt.getTime()) / (1000 * 60));
    let outMin = this.toMinutes(record.checkOut);
    let otMinutes = 0;
    
    if (totalWorked < 0) totalWorked = 0;

    if (record.is24HourShift) {
      if (checkInDate !== checkOutDate) {
        // Multi-day 24h / overnight shift
        const day1Obj = new Date(checkInDate + 'T00:00:00');
        const day2Obj = new Date(checkOutDate + 'T00:00:00');
        const isDay1Sat = day1Obj.getDay() === 6;
        const isDay1Sun = day1Obj.getDay() === 0;
        const isDay1Hol = this.holidaySvc.isHoliday(checkInDate);
        const isDay2Sat = day2Obj.getDay() === 6;
        const isDay2Sun = day2Obj.getDay() === 0;
        const isDay2Hol = this.holidaySvc.isHoliday(checkOutDate);

        // Day 1 standard threshold (Mon-Fri: 17:00, Sat: 13:00)
        const day1EndStr = isDay1Sat ? SATURDAY_END : WORK_END;
        const day1EndMin = this.toMinutes(day1EndStr);
        const day1RegularWorkMin = isDay1Sat ? (5 * 60) : (8 * 60);

        // Day 2 standard threshold (Mon-Fri: 17:00, Sat: 13:00)
        const day2StartMin = this.toMinutes(WORK_START); // 08:00
        const day2EndStr = isDay2Sat ? SATURDAY_END : WORK_END;
        const day2EndMin = this.toMinutes(day2EndStr);
        const day2RegularWorkMin = isDay2Sat ? (5 * 60) : (8 * 60);

        let day1RegularMinutes = 0;
        let overnightOtMinutes = 0;
        let day2RegularMinutes = 0;
        let day2OtMinutes = 0;

        // Day 1 Regular Hours (Rule 4)
        if (isDay1Sun || isDay1Hol) {
          overnightOtMinutes += day1RegularWorkMin;
        } else {
          day1RegularMinutes = day1RegularWorkMin;
        }

        // Overnight Period (from Day 1 end time e.g. 17:00 to Day 2 08:00)
        // Rule 9: Day 1 evening 21:00–22:00 (9 PM to 10 PM) is NOT OT; Day 2 morning 07:00–08:00 (7 AM to 8 AM) is NOT OT
        const day1EveningOt = this.calculateEveningOtMinutes(day1EndMin, 24 * 60);

        if (outMin <= day2StartMin) {
          // Checkout before or at 08:00 on Day 2
          const day2MorningOt = this.calculateMorningOvernightOtMinutes(outMin);
          overnightOtMinutes = day1EveningOt + day2MorningOt;
          day2RegularMinutes = 0;
          day2OtMinutes = 0;
        } else {
          // Worked into Day 2 morning / afternoon (past 08:00)
          const fullDay2MorningOt = this.calculateMorningOvernightOtMinutes(day2StartMin); // 7 hours (00:00 to 07:00)
          overnightOtMinutes = day1EveningOt + fullDay2MorningOt; // e.g. 6h + 7h = 13h

          if (isDay2Sun || isDay2Hol) {
            // Day 2 is Sunday or Holiday -> all hours worked are OT
            day2OtMinutes = this.calculateEveningOtMinutes(day2StartMin, outMin);
            day2RegularMinutes = 0;
          } else {
            // Day 2 is standard working day
            if (outMin >= day2EndMin) {
              // Rule 4: Stayed until Day 2 threshold or after -> 2nd full working day + OT after threshold
              day2RegularMinutes = day2RegularWorkMin;
              // Rule 9: Evening OT after threshold (e.g. 17:00) excludes 21:00–22:00
              day2OtMinutes = this.calculateEveningOtMinutes(day2EndMin, outMin);
            } else {
              // Rule 4: Left before 5 PM (or before 1 PM if Sat):
              // "second day full days is lost but hours is only show on OT"
              day2RegularMinutes = 0;
              day2OtMinutes = Math.max(0, outMin - day2StartMin);
            }
          }
        }

        otMinutes = overnightOtMinutes + day2OtMinutes;
        totalWorked = day1RegularMinutes + overnightOtMinutes + day2RegularMinutes + day2OtMinutes;
      } else {
        // Single day marked as 24h
        const endMin = dayType === 'saturday' ? this.toMinutes(SATURDAY_END) : this.toMinutes(WORK_END);
        const regularMinutes = dayType === 'saturday' ? (5 * 60) : (8 * 60);
        if (isSundayOrHoliday) {
          otMinutes = this.calculateEveningOtMinutes(this.toMinutes(WORK_START), outMin);
          totalWorked = otMinutes;
        } else {
          otMinutes = this.calculateEveningOtMinutes(endMin, outMin);
          totalWorked = regularMinutes + otMinutes;
        }
      }
    } else {
      // Standard (Non-24h) Shifts
      if (isSundayOrHoliday) {
        // Rule 3 & 9: Sunday and admin-marked holidays: all hours worked count as OT!
        // Rule 9: 9:00 PM to 10:00 PM (21:00 to 22:00) is NOT OT, after 10:00 PM is OT
        otMinutes = this.calculateEveningOtMinutes(this.toMinutes(calcCheckIn), outMin);
        totalWorked = otMinutes;
      } else if (dayType === 'saturday') {
        // Rule 2, 7 & 9: Saturday after 1:00 PM is OT (Rule 9: 21:00-22:00 is NOT OT)
        const endMin = this.toMinutes(SATURDAY_END);
        otMinutes = this.calculateEveningOtMinutes(endMin, outMin);
        if (outMin < endMin) {
          totalWorked = Math.min(totalWorked, 5 * 60);
        } else {
          totalWorked = (5 * 60) + otMinutes;
        }
      } else {
        // Rule 1, 5, 6, 8 & 9: Weekday after 5:00 PM is OT
        // Rule 9: 9:00 PM to 10:00 PM (21:00 to 22:00) is NOT OT, after 10:00 PM is OT
        const endMin = this.toMinutes(WORK_END);
        otMinutes = this.calculateEveningOtMinutes(endMin, outMin);
        if (outMin < endMin) {
          totalWorked = Math.min(totalWorked, 8 * 60);
        } else {
          totalWorked = (8 * 60) + otMinutes;
        }
      }
    }

    record.workedHours = this.toHours(totalWorked);
    record.otHours = this.toHours(otMinutes);

    // 4. Bonus & Status Validation (Rules 1, 2, 3, 4, 6, 7, 8)
    record.bonusDetails = [];
    record.bonusDaysEarned = 0;

    // Day 1 Logic
    const day1IsLate = record.isLate || false;
    let day1Eligible = !day1IsLate;
    let day1Reason = day1IsLate ? 'Late Arrival' : 'Completed';

    if (isSundayOrHoliday) {
      // Rule 3: Sunday / Holiday is OT only, does NOT earn a bonus day or regular working day
      day1Eligible = false;
      day1Reason = dayType === 'sunday' ? 'Sunday Work (OT only)' : 'Holiday Work (OT only)';
      record.actualStatus = dayType === 'sunday' ? 'Sunday Work' : 'Holiday Work';
    } else if (!record.is24HourShift) {
      if (dayType === 'saturday') {
        // Rule 2 & 7: Saturday on or before 8:00 AM to 1:00 PM
        const isCompleted = outMin >= this.toMinutes(SATURDAY_END);
        if (!isCompleted) {
          day1Eligible = false;
          day1Reason = `Left early at ${record.checkOut} (Before 1:00 PM)`;
          record.actualStatus = 'Early Leave';
        } else {
          record.actualStatus = day1IsLate ? 'Late Arrival' : 'Completed';
        }
      } else {
        // Rule 1, 6 & 8: Weekdays (Mon-Fri) on or before 8:00 AM to 5:00 PM
        // Rule 8: 8 AM to 1 PM on weekdays is NOT a full day / bonus day
        const isCompleted = outMin >= this.toMinutes(WORK_END);
        if (!isCompleted) {
          day1Eligible = false;
          day1Reason = `Left early at ${record.checkOut} (Before 5:00 PM)`;
          if (outMin <= this.toMinutes('12:00')) {
            record.actualStatus = 'Incomplete';
          } else {
            record.actualStatus = 'Early Leave';
          }
        } else {
          record.actualStatus = day1IsLate ? 'Late Arrival' : 'Completed';
        }
      }
    } else {
      // 24 Hour Shift Day 1 status (on regular working day)
      record.actualStatus = '24 Hour Shift';
      if (day1IsLate) {
        day1Eligible = false;
        day1Reason = 'Late Arrival';
      } else {
        day1Eligible = true;
        day1Reason = 'Completed';
      }
    }

    record.bonusDetails.push({
      date: checkInDate,
      isEligible: day1Eligible,
      reason: day1Reason
    });
    if (day1Eligible) record.bonusDaysEarned++;

    // Day 2 Logic (Overnight 24h Shift) (Rule 4)
    if (record.is24HourShift && checkInDate !== checkOutDate) {
      const outDateObj = new Date(checkOutDate + 'T00:00:00');
      const isDay2Sat = outDateObj.getDay() === 6;
      const isDay2Sun = outDateObj.getDay() === 0;
      const isDay2Hol = this.holidaySvc.isHoliday(checkOutDate);
      const threshold = isDay2Sat ? SATURDAY_END : WORK_END;
      const thresholdMin = this.toMinutes(threshold);

      let day2Eligible = false;
      let day2Reason = '';

      if (isDay2Sun || isDay2Hol) {
        day2Eligible = false;
        day2Reason = isDay2Sun ? 'Sunday Work (OT only)' : 'Holiday Work (OT only)';
      } else if (outMin >= thresholdMin) {
        day2Eligible = true;
        day2Reason = 'Completed';
      } else {
        // Rule 4: Leaves before 5:00 PM on Day 2 (or before 1:00 PM if Sat):
        // Second day full day is lost, hours only show on OT!
        day2Eligible = false;
        day2Reason = `Left early at ${record.checkOut} (Before ${threshold} - Day 2 full day lost, OT only)`;
      }

      record.bonusDetails.push({
        date: checkOutDate,
        isEligible: day2Eligible,
        reason: day2Reason
      });

      if (day2Eligible) {
        record.bonusDaysEarned++;
      }
    }

    record.lostBonus = record.bonusDaysEarned === 0;
  }

  async saveAttendance(uid: string, record: AttendanceRecord): Promise<void> {
    await this.holidaySvc.ensureLoaded();
    const path = `attendance/${uid}/${record.date}`;

    // Auto-detect post-overnight shift if not already flagged
    if (!record.isPostOvernightShift && record.date) {
      const prevDate = new Date(record.date + 'T00:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      const prevSnap = await get(ref(database, `attendance/${uid}/${prevStr}`));
      if (prevSnap.exists()) {
        const prevRec = prevSnap.val() as AttendanceRecord;
        if (prevRec && prevRec.checkOutDate === record.date && prevRec.checkOut) {
          record.isPostOvernightShift = true;
          record.overnightCheckOutTime = prevRec.checkOut;
        }
      }
    }

    this.calculateHoursAndStatus(record);
    await set(ref(database, path), record);
  }

  async updateAttendance(uid: string, date: string, changes: Partial<AttendanceRecord>): Promise<void> {
    await this.holidaySvc.ensureLoaded();
    const path = `attendance/${uid}/${date}`;
    const snap = await get(ref(database, path));
    if (snap.exists()) {
      const existing = snap.val() as AttendanceRecord;
      const merged = { ...existing, ...changes };
      this.calculateHoursAndStatus(merged);
      await update(ref(database, path), merged);
    }
  }

  async deleteAttendance(uid: string, date: string): Promise<void> {
    const path = `attendance/${uid}/${date}`;
    await remove(ref(database, path));
  }

  async getAttendanceForMonth(uid: string, year: number, month: number): Promise<AttendanceRecord[]> {
    await this.holidaySvc.ensureLoaded();
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const records = Object.values(all).filter(r => r.date.startsWith(prefix));

    // Map of overnight checkout dates -> checkout time
    const overnightEnds = new Map<string, string>();
    Object.values(all).forEach(r => {
      if (r && r.checkOutDate && r.checkOutDate > r.date && r.checkOut) {
        overnightEnds.set(r.checkOutDate, r.checkOut);
      }
    });

    records.forEach(r => {
      if (r && r.checkIn) {
        if (overnightEnds.has(r.date)) {
          r.isPostOvernightShift = true;
          r.overnightCheckOutTime = overnightEnds.get(r.date);
        }
        this.calculateHoursAndStatus(r);
      }
    });
    return records;
  }

  async getAttendanceForYear(uid: string, year: number): Promise<AttendanceRecord[]> {
    await this.holidaySvc.ensureLoaded();
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    const prefix = `${year}-`;
    const records = Object.values(all).filter(r => r.date.startsWith(prefix));

    const overnightEnds = new Map<string, string>();
    Object.values(all).forEach(r => {
      if (r && r.checkOutDate && r.checkOutDate > r.date && r.checkOut) {
        overnightEnds.set(r.checkOutDate, r.checkOut);
      }
    });

    records.forEach(r => {
      if (r && r.checkIn) {
        if (overnightEnds.has(r.date)) {
          r.isPostOvernightShift = true;
          r.overnightCheckOutTime = overnightEnds.get(r.date);
        }
        this.calculateHoursAndStatus(r);
      }
    });
    return records;
  }

  async getAttendanceForDate(uid: string, date: string): Promise<AttendanceRecord | null> {
    await this.holidaySvc.ensureLoaded();
    const snap = await get(ref(database, `attendance/${uid}/${date}`));
    if (!snap.exists()) return null;
    const rec = snap.val() as AttendanceRecord;
    if (rec && rec.checkIn) {
      if (!rec.isPostOvernightShift && date && date.length === 10) {
        try {
          const prevDate = new Date(date + 'T00:00:00');
          prevDate.setDate(prevDate.getDate() - 1);
          const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
          const prevSnap = await get(ref(database, `attendance/${uid}/${prevStr}`));
          if (prevSnap.exists()) {
            const prevRec = prevSnap.val() as AttendanceRecord;
            if (prevRec && prevRec.checkOutDate === date && prevRec.checkOut) {
              rec.isPostOvernightShift = true;
              rec.overnightCheckOutTime = prevRec.checkOut;
            }
          }
        } catch (e) {
          // silently continue
        }
      }
      this.calculateHoursAndStatus(rec);
    }
    return rec;
  }

  async getAttendanceForDateRange(uid: string, startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    await this.holidaySvc.ensureLoaded();
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    const records = Object.values(all)
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));

    const overnightEnds = new Map<string, string>();
    Object.values(all).forEach(r => {
      if (r && r.checkOutDate && r.checkOutDate > r.date && r.checkOut) {
        overnightEnds.set(r.checkOutDate, r.checkOut);
      }
    });

    records.forEach(r => {
      if (r && r.checkIn) {
        if (overnightEnds.has(r.date)) {
          r.isPostOvernightShift = true;
          r.overnightCheckOutTime = overnightEnds.get(r.date);
        }
        this.calculateHoursAndStatus(r);
      }
    });
    return records;
  }

  async getWorkingDaysBetween(startDate: string, endDate: string): Promise<string[]> {
    await this.holidaySvc.ensureLoaded();
    const days: string[] = [];
    if (startDate > endDate) return days;

    const cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (cur.getTime() <= end.getTime()) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const dayOfWeek = cur.getDay();
      // Exclude Sundays
      if (dayOfWeek !== 0 && !this.holidaySvc.isHoliday(dateStr)) {
        days.push(dateStr);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  async getAllAttendanceForMonth(year: number, month: number): Promise<Record<string, AttendanceRecord[]>> {
    const snap = await get(ref(database, 'attendance'));
    if (!snap.exists()) return {};
    const allUsers = snap.val() as Record<string, Record<string, AttendanceRecord>>;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const result: Record<string, AttendanceRecord[]> = {};
    for (const uid in allUsers) {
      result[uid] = Object.values(allUsers[uid]).filter(r => r.date.startsWith(prefix));
    }
    return result;
  }

  async getWorkingDaysInMonth(year: number, month: number): Promise<string[]> {
    await this.holidaySvc.ensureLoaded();
    const days: string[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const day = new Date(dateStr + 'T00:00:00').getDay();
      
      // Exclude Sundays
      if (day === 0) continue;
      
      // Exclude public holidays
      if (this.holidaySvc.isHoliday(dateStr)) continue;
      
      days.push(dateStr);
    }
    return days;
  }

  async checkIn(uid: string): Promise<void> {
    const today = this.getTodayStr();
    const existing = await this.getAttendanceForDate(uid, today);
    if (existing?.checkIn) throw new Error('Already checked in today');

    // Check if an overnight shift ended today
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const yExisting = await this.getAttendanceForDate(uid, yStr);
    const isPostOvernight = !!(yExisting && yExisting.checkOutDate === today && yExisting.checkOut);

    const now = this.getCurrentTimeStr();
    const record: AttendanceRecord = {
      date: today,
      checkIn: now,
      status: 'present',
      isPostOvernightShift: isPostOvernight,
      overnightCheckOutTime: isPostOvernight ? yExisting?.checkOut : undefined
    };
    await this.saveAttendance(uid, record);
  }

  async checkOut(uid: string): Promise<void> {
    const today = this.getTodayStr();
    let existing = await this.getAttendanceForDate(uid, today);
    let targetDate = today;

    // If no check-in today, check if yesterday has an uncompleted check-in (overnight shift)
    if (!existing?.checkIn) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      const yExisting = await this.getAttendanceForDate(uid, yStr);
      if (yExisting?.checkIn && !yExisting?.checkOut) {
        existing = yExisting;
        targetDate = yStr;
      }
    }

    if (!existing?.checkIn) throw new Error('Please check in first');
    if (existing?.checkOut) throw new Error('Already checked out today');
    const now = this.getCurrentTimeStr();

    if (targetDate === today && this.toMinutes(now) <= this.toMinutes(existing.checkIn!)) {
      throw new Error('Check-out must be after check-in');
    }

    const updates: Partial<AttendanceRecord> = { checkOut: now };
    if (targetDate !== today) {
      updates.checkInDate = targetDate;
      updates.checkOutDate = today;
      updates.shiftType = '24h';
      updates.is24HourShift = true;
    }

    await this.updateAttendance(uid, targetDate, updates);
  }

  /**
   * Explicitly checks out an overnight shift started yesterday, specifying departure time (e.g. '02:00').
   */
  async checkOutOvernightShift(uid: string, customOutTime?: string): Promise<AttendanceRecord> {
    const today = this.getTodayStr();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const yExisting = await this.getAttendanceForDate(uid, yStr);

    if (!yExisting?.checkIn) throw new Error('No active overnight shift found from yesterday');
    if (yExisting?.checkOut) throw new Error('Yesterday shift is already checked out');

    const now = customOutTime || this.getCurrentTimeStr();
    const updates: Partial<AttendanceRecord> = {
      checkOut: now,
      checkInDate: yStr,
      checkOutDate: today,
      shiftType: '24h',
      is24HourShift: true
    };
    await this.updateAttendance(uid, yStr, updates);
    const updated = await this.getAttendanceForDate(uid, yStr);
    return updated!;
  }

  getTodayStr(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  getCurrentTimeStr(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  saveFoodRequest(payload: { name: string; division: string; lunchCategory: string }): Observable<any> {
    const id = `FR-${Date.now()}`;
    const now = new Date();
    const dateTime = now.toISOString();
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const day = now.getDate();
    const year = now.getFullYear();
    
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');
    
    const formattedDateTime = `${month} ${day}, ${year}, ${hoursStr}:${minutes} ${ampm}`;

    const newRequest = {
      id,
      dateTime,
      formattedDateTime,
      ...payload
    };
    const savePromise = set(ref(database, `foodRequests/${id}`), newRequest)
      .then(() => {
        this.saveToLocalStorage(newRequest);
        return newRequest;
      })
      .catch(err => {
        console.warn('Firebase save failed (using localStorage fallback):', err.message);
        this.saveToLocalStorage(newRequest);
        return newRequest;
      });
    return from(savePromise);
  }

  saveLocalFoodRequest(payload: { name: string; division: string; lunchCategory: string }): Observable<any> {
    return this.saveFoodRequest(payload);
  }

  getFoodRequests(): Observable<any[]> {
    const fetchPromise = get(ref(database, 'foodRequests'))
      .then(snap => {
        if (!snap.exists()) {
          return this.getFromLocalStorage();
        }
        const data = snap.val();
        const list = Object.values(data)
          .sort((a: any, b: any) => b.dateTime.localeCompare(a.dateTime));
        localStorage.setItem('localFoodRequests', JSON.stringify(list));
        return list;
      })
      .catch(err => {
        console.warn('Firebase read failed (using localStorage fallback):', err.message);
        return this.getFromLocalStorage();
      });
    return from(fetchPromise);
  }

  getLocalRequests(): Observable<any[]> {
    return this.getFoodRequests();
  }

  private saveToLocalStorage(newRequest: any) {
    try {
      const list = this.getFromLocalStorage();
      list.unshift(newRequest);
      localStorage.setItem('localFoodRequests', JSON.stringify(list));
    } catch (e) {
      console.error('LocalStorage write failed:', e);
    }
  }

  private getFromLocalStorage(): any[] {
    try {
      const data = localStorage.getItem('localFoodRequests');
      const list = data ? JSON.parse(data) : [];
      if (Array.isArray(list)) {
        return list.sort((a: any, b: any) => b.dateTime.localeCompare(a.dateTime));
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}

