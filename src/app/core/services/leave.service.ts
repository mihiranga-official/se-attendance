import { Injectable } from '@angular/core';
import { ref, set, get, update } from 'firebase/database';
import { database } from '../firebase.config';
import { LeaveRecord } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class LeaveService {

  async applyLeave(uid: string, leave: Omit<LeaveRecord, 'leaveId' | 'status' | 'appliedAt'>): Promise<void> {
    const leaveId = `leave_${Date.now()}`;
    const record: LeaveRecord = {
      ...leave,
      leaveId,
      status: 'approved',
      appliedAt: new Date().toISOString()
    };
    await set(ref(database, `leaves/${uid}/${leaveId}`), record);
  }

  async getLeaves(uid: string): Promise<LeaveRecord[]> {
    const snap = await get(ref(database, `leaves/${uid}`));
    if (!snap.exists()) return [];
    return Object.values(snap.val() as Record<string, LeaveRecord>)
      .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  }

  async getLeavesForMonth(uid: string, year: number, month: number): Promise<LeaveRecord[]> {
    const all = await this.getLeaves(uid);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return all.filter(l => l.date.startsWith(prefix) && l.status === 'approved');
  }

  async getAllLeaves(): Promise<Record<string, LeaveRecord[]>> {
    const snap = await get(ref(database, 'leaves'));
    if (!snap.exists()) return {};
    const result: Record<string, LeaveRecord[]> = {};
    const all = snap.val() as Record<string, Record<string, LeaveRecord>>;
    for (const uid in all) {
      result[uid] = Object.values(all[uid]).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
    }
    return result;
  }


  async updateLeaveCoveredHours(uid: string, leaveId: string, hours: number): Promise<void> {
    await update(ref(database, `leaves/${uid}/${leaveId}`), { coveredHours: hours });
  }

  async deleteLeave(uid: string, leaveId: string): Promise<void> {
    await set(ref(database, `leaves/${uid}/${leaveId}`), null);
  }
}
