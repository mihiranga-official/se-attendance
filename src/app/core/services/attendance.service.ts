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

  getDayType(dateStr: string): 'weekday' | 'saturday' | 'sunday' {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    if (day === 0) return 'sunday';
    if (day === 6) return 'saturday';
    return 'weekday';
  }

  /**
   * Calculates the exact number of full working days earned for an attendance record (0, 1, or 2):
   * Business Rules:
   * 1. Must check in on or before 08:00 AM (inMin <= 480). Late arrivals do not count as a day.
   * 2. Regular Weekdays (Mon-Fri): Must check out at or after 17:00 (5:00 PM, outMin >= 1020).
   * 3. Regular Saturdays: Must check out at or after 13:00 (1:00 PM, outMin >= 780).
   * 4. Sundays: Excluded from regular working day counts.
   * 5. 24-Hour / Overnight Shifts:
   *    - Day 1: Earns 1 full day IF check-in was on or before 08:00 AM.
   *    - Day 2: Earns an additional 1 full day ONLY IF check-out on Day 2 is at or after 17:00
   *      (or 13:00 if Day 2 is Saturday).
   * 6. Strictly NO fractional / half days (e.g. 0.5 or 1.5). Only full days count!
   */
  getFullDaysEarned(record: Partial<AttendanceRecord>): number {
    if (!record || record.status === 'absent') return 0;
    if (record.status === 'Saturday Covered') return 1;
    if (!record.checkIn) return 0;

    const inMin = this.toMinutes(record.checkIn);
    const startMin = this.toMinutes(WORK_START); // 08:00

    // Day 1: Must arrive on or before 08:00 AM
    const day1OnTime = inMin <= startMin;

    const day1Date = record.checkInDate || record.date;
    if (!day1Date) return 0;

    const day1Obj = new Date(day1Date + 'T00:00:00');
    const day1DayOfWeek = day1Obj.getDay();

    const is24h = !!(record.is24HourShift && record.checkInDate && record.checkOutDate && record.checkInDate !== record.checkOutDate);

    if (!is24h) {
      // Sundays are excluded from regular working days
      if (day1DayOfWeek === 0) return 0;
      if (!record.checkOut) return 0;
      if (!day1OnTime) return 0; // Late arrival does NOT earn a full day

      const outMin = this.toMinutes(record.checkOut);
      if (day1DayOfWeek === 6) {
        // Saturday: must checkout at or after 13:00 (1:00 PM)
        return outMin >= this.toMinutes(SATURDAY_END) ? 1 : 0;
      } else {
        // Weekday: must checkout at or after 17:00 (5:00 PM)
        return outMin >= this.toMinutes(WORK_END) ? 1 : 0;
      }
    } else {
      // 24-Hour Shift across two calendar days
      let daysEarned = 0;

      // Day 1: Earns 1 full day if Day 1 is not Sunday and arrived on time
      if (day1DayOfWeek !== 0 && day1OnTime) {
        daysEarned += 1;
      }

      // Day 2:
      if (record.checkOut && record.checkOutDate) {
        const outDateObj = new Date(record.checkOutDate + 'T00:00:00');
        const day2DayOfWeek = outDateObj.getDay();
        if (day2DayOfWeek !== 0) { // Day 2 is not Sunday
          const outMin = this.toMinutes(record.checkOut);
          const day2ThresholdMin = day2DayOfWeek === 6 
            ? this.toMinutes(SATURDAY_END) 
            : this.toMinutes(WORK_END);
          
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
    const startMin = this.toMinutes(WORK_START);
    const dayType = record.date ? this.getDayType(record.date) : 'weekday';

    // 1. Calculate Late Status
    if (inMin > startMin) {
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
      record.lostBonus = false;
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
      record.actualStatus = record.isLate ? 'Late Arrival' : 'Incomplete';
      return;
    }

    // 3. Calculate Worked Hours
    const checkInDate = record.checkInDate || record.date || '';
    const checkOutDate = record.checkOutDate || record.date || '';
    
    // Cap working hours starting time at 08:00 AM for early check-ins
    let calcCheckIn = record.checkIn;
    if (calcCheckIn && this.toMinutes(calcCheckIn) < this.toMinutes(WORK_START)) {
      calcCheckIn = WORK_START;
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
        const isDay2Sat = day2Obj.getDay() === 6;
        const isDay2Sun = day2Obj.getDay() === 0;

        // Day 1 standard threshold (Mon-Fri: 17:00, Sat: 13:00)
        const day1EndStr = isDay1Sat ? SATURDAY_END : WORK_END;
        const day1EndMin = this.toMinutes(day1EndStr);
        const day1RegularWorkMin = isDay1Sat ? (5 * 60) : (8 * 60);

        // Day 2 standard threshold (Mon-Fri: 17:00, Sat: 13:00)
        const day2StartMin = this.toMinutes(WORK_START); // 08:00
        const day2EndStr = isDay2Sat ? SATURDAY_END : WORK_END;
        const day2EndMin = this.toMinutes(day2EndStr);

        let day1RegularMinutes = 0;
        let overnightOtMinutes = 0;
        let day2RegularMinutes = 0;
        let day2OtMinutes = 0;

        // Day 1 Regular Hours (08:00 to 17:00, or 08:00 to 13:00)
        if (isDay1Sun) {
          overnightOtMinutes += day1RegularWorkMin;
        } else {
          day1RegularMinutes = day1RegularWorkMin;
        }

        // Overnight Period (from Day 1 end time e.g. 17:00 to Day 2 08:00)
        // Deduct 1 hour (60 min) for dinner / night break
        const overnightBreakMin = 60;

        if (outMin <= day2StartMin) {
          // Checkout before or at 08:00 on Day 2
          const nightElapsedMin = (24 * 60 - day1EndMin) + outMin;
          overnightOtMinutes += Math.max(0, nightElapsedMin - overnightBreakMin);
          day2RegularMinutes = 0;
          day2OtMinutes = 0;
        } else {
          // Worked into Day 2 morning / afternoon
          const fullNightElapsedMin = (24 * 60 - day1EndMin) + day2StartMin; // e.g. 15 hours
          overnightOtMinutes += Math.max(0, fullNightElapsedMin - overnightBreakMin); // 14 hours

          if (isDay2Sun) {
            // Day 2 is Sunday -> all hours worked are OT
            day2OtMinutes = Math.max(0, outMin - day2StartMin);
          } else {
            // Day 2 is standard working day
            const day2WorkedBeforeEnd = Math.max(0, Math.min(outMin, day2EndMin) - day2StartMin);
            // Deduct lunch break (60 min) if worked past 13:00 on weekdays:
            const day2LunchBreak = (!isDay2Sat && outMin >= this.toMinutes('13:00')) ? 60 : 0;
            day2RegularMinutes = Math.max(0, day2WorkedBeforeEnd - day2LunchBreak);

            if (outMin > day2EndMin) {
              day2OtMinutes = outMin - day2EndMin;
            }
          }
        }

        otMinutes = overnightOtMinutes + day2OtMinutes;
        totalWorked = day1RegularMinutes + overnightOtMinutes + day2RegularMinutes + day2OtMinutes;
      } else {
        // Single day marked as 24h
        const endMin = dayType === 'saturday' ? this.toMinutes(SATURDAY_END) : this.toMinutes(WORK_END);
        const regularMinutes = dayType === 'saturday' ? (5 * 60) : (8 * 60);
        otMinutes = Math.max(0, outMin - endMin);
        totalWorked = regularMinutes + otMinutes;
      }
    } else {
      const isPublicHoliday = record.date ? this.holidaySvc.isHoliday(record.date) : false;
      if (dayType === 'sunday' || isPublicHoliday) {
        otMinutes = totalWorked; // All hours worked on Sundays or holidays count as OT
      } else if (dayType === 'saturday') {
        const endMin = this.toMinutes(SATURDAY_END);
        otMinutes = Math.max(0, outMin - endMin);
      } else {
        const endMin = this.toMinutes(WORK_END);
        otMinutes = Math.max(0, outMin - endMin);
      }
    }

    record.workedHours = this.toHours(totalWorked);
    record.otHours = this.toHours(otMinutes);

    // 4. Bonus & Status Validation
    record.bonusDetails = [];
    record.bonusDaysEarned = 0;

    // Day 1 Logic
    const day1IsLate = record.isLate || false;
    let day1Eligible = !day1IsLate;
    let day1Reason = day1IsLate ? 'Late Arrival' : 'Completed';

    if (!record.is24HourShift) {
      if (dayType === 'saturday') {
        const isCompleted = outMin >= this.toMinutes(SATURDAY_END);
        if (!isCompleted) {
          day1Eligible = false;
          day1Reason = 'Left Early';
          const workedRatio = totalWorked / (5 * 60);
          if (workedRatio < 0.4) record.actualStatus = 'Incomplete';
          else record.actualStatus = 'Half Day';
        } else {
          record.actualStatus = day1IsLate ? 'Late Arrival' : 'Completed';
        }
      } else {
        // Weekdays (Monday - Friday)
        const isCompleted = outMin >= this.toMinutes(WORK_END);
        if (!isCompleted) {
          day1Eligible = false;
          day1Reason = 'Left Early';
          if (outMin <= this.toMinutes('12:00')) {
            record.actualStatus = 'Incomplete';
          } else {
            record.actualStatus = 'Half Day';
          }
        } else {
          record.actualStatus = day1IsLate ? 'Late Arrival' : 'Completed';
        }
      }
    } else {
      record.actualStatus = '24 Hour Shift';
    }

    record.bonusDetails.push({
      date: checkInDate,
      isEligible: day1Eligible,
      reason: day1Reason
    });
    if (day1Eligible) record.bonusDaysEarned++;

    // Day 2 Logic (Overnight)
    if (record.is24HourShift && checkInDate !== checkOutDate) {
      const outDateObj = new Date(checkOutDate);
      const isSaturdayOut = outDateObj.getDay() === 6;
      const threshold = isSaturdayOut ? SATURDAY_END : WORK_END;
      const day2Eligible = outMin >= this.toMinutes(threshold);
      
      record.bonusDetails.push({
        date: checkOutDate,
        isEligible: day2Eligible,
        reason: day2Eligible ? 'Completed' : `Left early at ${record.checkOut} (Not full day)`
      });
      if (day2Eligible) {
        record.bonusDaysEarned++;
        record.actualStatus = '24 Hour Shift';
      } else {
        // If left early (e.g., 3 PM instead of 5 PM), second day is a Half Day or Incomplete
        record.actualStatus = outMin >= this.toMinutes('12:00') ? 'Half Day' : 'Incomplete';
      }
    }

    record.lostBonus = record.bonusDaysEarned === 0;
  }

  async saveAttendance(uid: string, record: AttendanceRecord): Promise<void> {
    await this.holidaySvc.ensureLoaded();
    const path = `attendance/${uid}/${record.date}`;
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
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    
    // Auto-remove any stray records in 2026 Jan 1 - Mar 31 range
    if (year === 2026 && month <= 3) {
      for (const [date, r] of Object.entries(all)) {
        if (date >= '2026-01-01' && date <= '2026-03-31') {
          remove(ref(database, `attendance/${uid}/${date}`)).catch(e => console.error(e));
          delete all[date];
        }
      }
    }
    
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return Object.values(all).filter(r => r.date.startsWith(prefix));
  }

  async getAttendanceForYear(uid: string, year: number): Promise<AttendanceRecord[]> {
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    
    // Auto-remove any stray records in 2026 Jan 1 - Mar 31 range
    if (year === 2026) {
      for (const [date, r] of Object.entries(all)) {
        if (date >= '2026-01-01' && date <= '2026-03-31') {
          remove(ref(database, `attendance/${uid}/${date}`)).catch(e => console.error(e));
          delete all[date];
        }
      }
    }
    
    const prefix = `${year}-`;
    return Object.values(all).filter(r => r.date.startsWith(prefix));
  }

  async getAttendanceForDate(uid: string, date: string): Promise<AttendanceRecord | null> {
    if (date >= '2026-01-01' && date <= '2026-03-31') {
      const snap = await get(ref(database, `attendance/${uid}/${date}`));
      if (snap.exists()) {
        remove(ref(database, `attendance/${uid}/${date}`)).catch(e => console.error(e));
      }
      return null;
    }
    const snap = await get(ref(database, `attendance/${uid}/${date}`));
    return snap.exists() ? snap.val() : null;
  }

  async getAttendanceForDateRange(uid: string, startDate: string, endDate: string): Promise<AttendanceRecord[]> {
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    
    // Auto-remove any stray records in 2026 Jan 1 - Mar 31 range
    for (const [date, r] of Object.entries(all)) {
      if (date >= '2026-01-01' && date <= '2026-03-31') {
        remove(ref(database, `attendance/${uid}/${date}`)).catch(e => console.error(e));
        delete all[date];
      }
    }
    
    return Object.values(all)
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
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
    const now = this.getCurrentTimeStr();
    const record: AttendanceRecord = {
      date: today,
      checkIn: now,
      status: 'present'
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

