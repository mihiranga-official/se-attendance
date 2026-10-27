import { Injectable } from '@angular/core';
import { ref, set, get, update } from 'firebase/database';
import { database } from '../firebase.config';
import { LeaveRecord, LeaveBalances } from '../models/user.model';

export const DEFAULT_LEAVE_BALANCES: LeaveBalances = {
  casual: { allocated: 7, used: 0 },
  annual: { allocated: 14, used: 0 }
};

@Injectable({ providedIn: 'root' })
export class LeaveService {

  async getLeaveBalances(uid: string): Promise<LeaveBalances> {
    if (!uid) return { ...DEFAULT_LEAVE_BALANCES };
    try {
      const snap = await get(ref(database, `users/${uid}/leaveBalances`));
      if (snap.exists() && snap.val()) {
        const val = snap.val();
        return {
          casual: { allocated: val?.casual?.allocated ?? 7, used: val?.casual?.used ?? 0 },
          annual: { allocated: val?.annual?.allocated ?? 14, used: val?.annual?.used ?? 0 }
        };
      }
    } catch (e) {}

    try {
      const altSnap = await get(ref(database, `leaveBalances/${uid}`));
      if (altSnap.exists() && altSnap.val()) {
        const val = altSnap.val();
        return {
          casual: { allocated: val?.casual?.allocated ?? 7, used: val?.casual?.used ?? 0 },
          annual: { allocated: val?.annual?.allocated ?? 14, used: val?.annual?.used ?? 0 }
        };
      }
    } catch (e) {}

    return { ...DEFAULT_LEAVE_BALANCES };
  }

  async updateLeaveBalances(uid: string, balances: LeaveBalances): Promise<void> {
    if (!uid) return;
    let written = false;
    try {
      await update(ref(database, `users/${uid}`), { leaveBalances: balances });
      written = true;
    } catch (err) {
      console.warn(`Direct write to users/${uid} restricted:`, err);
    }

    try {
      await set(ref(database, `leaveBalances/${uid}`), balances);
      written = true;
    } catch (altErr) {
      if (!written) {
        throw altErr;
      }
    }
  }

  async applyLeave(uid: string, leave: Omit<LeaveRecord, 'leaveId' | 'status' | 'appliedAt'>): Promise<void> {
    const leaveId = `leave_${Date.now()}`;
    const record: LeaveRecord = {
      ...leave,
      leaveId,
      status: 'approved',
      appliedAt: new Date().toISOString()
    };

    // If leave is covered by overtime or covering day, mark accordingly and DO NOT deduct from quota
    if (leave.isCovered || leave.isOvertimeCovered) {
      record.isCovered = true;
      record.isOvertimeCovered = true;
    } else if (leave.leaveCategory && ['casual', 'annual', 'total'].includes(leave.leaveCategory)) {
      // Deduct from unified 21-day quota (Casual 7 + Annual 14)
      const deduction = leave.type === 'full' ? 1 : 0.5;
      const currentBalances = await this.getLeaveBalances(uid);
      if (leave.leaveCategory === 'annual') {
        currentBalances.annual.used = parseFloat(((currentBalances.annual.used || 0) + deduction).toFixed(1));
      } else if (leave.leaveCategory === 'casual') {
        currentBalances.casual.used = parseFloat(((currentBalances.casual.used || 0) + deduction).toFixed(1));
      } else {
        // Unified pool: fill casual first (up to 7), then annual (up to 14)
        const casualRemaining = Math.max(0, currentBalances.casual.allocated - currentBalances.casual.used);
        if (casualRemaining >= deduction) {
          currentBalances.casual.used = parseFloat((currentBalances.casual.used + deduction).toFixed(1));
          record.leaveCategory = 'casual';
        } else {
          const fromCasual = casualRemaining;
          const fromAnnual = deduction - fromCasual;
          currentBalances.casual.used = parseFloat((currentBalances.casual.used + fromCasual).toFixed(1));
          currentBalances.annual.used = parseFloat((currentBalances.annual.used + fromAnnual).toFixed(1));
          record.leaveCategory = 'annual';
        }
      }
      await this.updateLeaveBalances(uid, currentBalances);
    }

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

  async getLeavesForDateRange(uid: string, startDate: string, endDate: string): Promise<LeaveRecord[]> {
    const all = await this.getLeaves(uid);
    return all.filter(l => l.date >= startDate && l.date <= endDate && l.status === 'approved');
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

  async updateLeave(uid: string, leaveId: string, updatedData: Partial<LeaveRecord>, oldRecord: LeaveRecord): Promise<void> {
    // 1. Calculate old quota deduction
    const oldDeducted = (!oldRecord.isCovered && !oldRecord.isOvertimeCovered && oldRecord.leaveCategory && ['casual', 'annual'].includes(oldRecord.leaveCategory))
      ? (oldRecord.type === 'full' ? 1 : 0.5)
      : 0;
    const oldCat = oldRecord.leaveCategory as 'casual' | 'annual' | undefined;

    // 2. Calculate new quota deduction
    const isNewOvertimeCovered = updatedData.isOvertimeCovered ?? oldRecord.isOvertimeCovered;
    const isNewCovered = updatedData.isCovered ?? oldRecord.isCovered;
    const newCat = (updatedData.leaveCategory ?? oldRecord.leaveCategory) as 'casual' | 'annual' | undefined;
    const newType = updatedData.type ?? oldRecord.type;
    const newDeducted = (!isNewCovered && !isNewOvertimeCovered && newCat && ['casual', 'annual'].includes(newCat))
      ? (newType === 'full' ? 1 : 0.5)
      : 0;

    // 3. Adjust balances if deductions changed
    if (oldDeducted > 0 || newDeducted > 0) {
      const currentBalances = await this.getLeaveBalances(uid);
      if (oldDeducted > 0 && oldCat && currentBalances[oldCat]) {
        currentBalances[oldCat].used = parseFloat(Math.max(0, (currentBalances[oldCat].used || 0) - oldDeducted).toFixed(1));
      }
      if (newDeducted > 0 && newCat && currentBalances[newCat]) {
        currentBalances[newCat].used = parseFloat(((currentBalances[newCat].used || 0) + newDeducted).toFixed(1));
      }
      await this.updateLeaveBalances(uid, currentBalances);
    }

    // 4. Update the record
    await update(ref(database, `leaves/${uid}/${leaveId}`), updatedData);
  }

  async deleteLeave(uid: string, leaveId: string): Promise<void> {
    // If the leave deducted from quota, restore the used count
    const snap = await get(ref(database, `leaves/${uid}/${leaveId}`));
    if (snap.exists()) {
      const leave = snap.val() as LeaveRecord;
      if (!leave.isCovered && !leave.isOvertimeCovered && leave.leaveCategory && ['casual', 'annual'].includes(leave.leaveCategory)) {
        const deduction = leave.type === 'full' ? 1 : 0.5;
        const currentBalances = await this.getLeaveBalances(uid);
        const category = leave.leaveCategory as 'casual' | 'annual';
        if (currentBalances[category]) {
          currentBalances[category].used = parseFloat(Math.max(0, (currentBalances[category].used || 0) - deduction).toFixed(1));
          await this.updateLeaveBalances(uid, currentBalances);
        }
      }
    }
    await set(ref(database, `leaves/${uid}/${leaveId}`), null);
  }
}
