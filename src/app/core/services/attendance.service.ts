import { Injectable } from '@angular/core';
import { ref, set, get, update, remove, onValue } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';
import { Observable, of, from } from 'rxjs';



const WORK_START = '08:00';
const WORK_END = '17:00';
const SATURDAY_END = '13:00';

@Injectable({ providedIn: 'root' })
export class AttendanceService {

  private toMinutes(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private toHours(minutes: number): number {
    return parseFloat((minutes / 60).toFixed(2));
  }

  getDayType(dateStr: string): 'weekday' | 'saturday' | 'sunday' {
    const day = new Date(dateStr).getDay();
    if (day === 0) return 'sunday';
    if (day === 6) return 'saturday';
    return 'weekday';
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
    
    const startDt = new Date(`${checkInDate}T${record.checkIn}`);
    const endDt = new Date(`${checkOutDate}T${record.checkOut}`);
    
    let totalWorked = Math.floor((endDt.getTime() - startDt.getTime()) / (1000 * 60));
    let outMin = this.toMinutes(record.checkOut);
    let otMinutes = 0;
    
    if (totalWorked < 0) totalWorked = 0;

    if (record.is24HourShift) {
      // Deduct 2 hours for lunch and dinner breaks
      totalWorked = Math.max(0, totalWorked - 120);
      otMinutes = Math.max(0, totalWorked - (9 * 60)); // Anything over 9h is OT? Standard is 9h.
    } else {
      if (dayType === 'saturday') {
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
      const isCompleted = dayType === 'saturday' ? outMin >= this.toMinutes(SATURDAY_END) : outMin >= this.toMinutes(WORK_END);
      if (!isCompleted) {
        day1Eligible = false;
        day1Reason = 'Left Early';
        
        if (outMin <= this.toMinutes('12:01')) {
          record.actualStatus = 'Incomplete';
        } else {
          const reqMins = dayType === 'saturday' ? 5 * 60 : 9 * 60;
          const workedRatio = totalWorked / reqMins;
          if (workedRatio < 0.4) record.actualStatus = 'Incomplete';
          else if (workedRatio < 0.8) record.actualStatus = 'Half Day';
          else record.actualStatus = 'Early Leave';
        }
      } else {
        record.actualStatus = day1IsLate ? 'Late Arrival' : 'Completed';
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
        reason: day2Eligible ? 'Completed' : `Left before ${threshold}`
      });
      if (day2Eligible) record.bonusDaysEarned++;
    }

    record.lostBonus = record.bonusDaysEarned === 0;
  }

  async saveAttendance(uid: string, record: AttendanceRecord): Promise<void> {
    const path = `attendance/${uid}/${record.date}`;
    this.calculateHoursAndStatus(record);
    await set(ref(database, path), record);
  }

  async updateAttendance(uid: string, date: string, changes: Partial<AttendanceRecord>): Promise<void> {
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
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return Object.values(all).filter(r => r.date.startsWith(prefix));
  }

  async getAttendanceForYear(uid: string, year: number): Promise<AttendanceRecord[]> {
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    const prefix = `${year}-`;
    return Object.values(all).filter(r => r.date.startsWith(prefix));
  }

  async getAttendanceForDate(uid: string, date: string): Promise<AttendanceRecord | null> {
    const snap = await get(ref(database, `attendance/${uid}/${date}`));
    return snap.exists() ? snap.val() : null;
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

  getWorkingDaysInMonth(year: number, month: number): string[] {
    const days: string[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const day = new Date(dateStr).getDay();
      if (day !== 0) days.push(dateStr); // exclude Sundays
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
    const existing = await this.getAttendanceForDate(uid, today);
    if (!existing?.checkIn) throw new Error('Please check in first');
    if (existing?.checkOut) throw new Error('Already checked out today');
    const now = this.getCurrentTimeStr();
    if (this.toMinutes(now) <= this.toMinutes(existing.checkIn!)) {
      throw new Error('Check-out must be after check-in');
    }
    await this.updateAttendance(uid, today, { checkOut: now });
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
    const dateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newRequest = {
      id,
      dateTime,
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
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }
}

