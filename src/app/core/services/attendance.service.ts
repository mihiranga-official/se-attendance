import { Injectable } from '@angular/core';
import { ref, set, get, update, onValue } from 'firebase/database';
import { database } from '../firebase.config';
import { AttendanceRecord } from '../models/user.model';

const WORK_START = '08:00';
const WORK_END = '17:00';
const SATURDAY_END = '13:00';

@Injectable({ providedIn: 'root' })
export class AttendanceService {

  private toMinutes(time: string): number {
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

  calculateHours(checkIn: string, checkOut: string, dateStr: string): { workedHours: number; otHours: number } {
    const inMin = this.toMinutes(checkIn);
    const outMin = this.toMinutes(checkOut);
    const dayType = this.getDayType(dateStr);

    if (outMin <= inMin) return { workedHours: 0, otHours: 0 };

    const totalWorked = outMin - inMin;
    let otMinutes = 0;

    if (dayType === 'saturday') {
      const endMin = this.toMinutes(SATURDAY_END);
      otMinutes = Math.max(0, outMin - endMin);
    } else {
      const endMin = this.toMinutes(WORK_END);
      otMinutes = Math.max(0, outMin - endMin);
    }

    return {
      workedHours: this.toHours(totalWorked),
      otHours: this.toHours(otMinutes)
    };
  }

  async saveAttendance(uid: string, record: AttendanceRecord): Promise<void> {
    const path = `attendance/${uid}/${record.date}`;
    if (record.checkIn && record.checkOut) {
      const calc = this.calculateHours(record.checkIn, record.checkOut, record.date);
      record.workedHours = calc.workedHours;
      record.otHours = calc.otHours;
    }
    await set(ref(database, path), record);
  }

  async updateAttendance(uid: string, date: string, changes: Partial<AttendanceRecord>): Promise<void> {
    const path = `attendance/${uid}/${date}`;
    const snap = await get(ref(database, path));
    if (snap.exists()) {
      const existing = snap.val() as AttendanceRecord;
      const merged = { ...existing, ...changes };
      if (merged.checkIn && merged.checkOut) {
        const calc = this.calculateHours(merged.checkIn, merged.checkOut, date);
        merged.workedHours = calc.workedHours;
        merged.otHours = calc.otHours;
      }
      await update(ref(database, path), merged);
    }
  }

  async getAttendanceForMonth(uid: string, year: number, month: number): Promise<AttendanceRecord[]> {
    const snap = await get(ref(database, `attendance/${uid}`));
    if (!snap.exists()) return [];
    const all = snap.val() as Record<string, AttendanceRecord>;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
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
}
