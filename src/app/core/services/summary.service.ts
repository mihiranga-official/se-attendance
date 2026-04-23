import { Injectable } from '@angular/core';
import { AttendanceRecord, MonthlySummary } from '../models/user.model';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';

@Injectable({ providedIn: 'root' })
export class SummaryService {

  constructor(
    private attendanceService: AttendanceService,
    private leaveService: LeaveService
  ) {}

  async getMonthlySummary(uid: string, year: number, month: number): Promise<MonthlySummary> {
    const workingDays = this.attendanceService.getWorkingDaysInMonth(year, month);
    const records = await this.attendanceService.getAttendanceForMonth(uid, year, month);
    const leaves = await this.leaveService.getLeavesForMonth(uid, year, month);

    const recordMap = new Map(records.map(r => [r.date, r]));

    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let halfDays = 0;
    let totalOTHours = 0;
    let extraDays = 0;

    for (const day of workingDays) {
      const rec = recordMap.get(day);
      const leave = leaves.find(l => l.date === day);

      if (leave) {
        if (leave.type === 'full') leaveDays++;
        else { halfDays++; leaveDays += 0.5; }
        continue;
      }

      if (!rec || rec.status === 'absent') {
        absentDays++;
      } else if (rec.status === 'present' || rec.checkIn) {
        presentDays++;
        totalOTHours += rec.otHours ?? 0;
      }
    }

    // Count extra days (worked Sundays)
    const allRecords = records;
    for (const rec of allRecords) {
      const isSunday = new Date(rec.date).getDay() === 0;
      if (isSunday && (rec.status === 'present' || rec.checkIn)) {
        extraDays++;
      }
    }

    const totalWorkingDays = workingDays.length;
    const attendancePercentage = totalWorkingDays > 0
      ? parseFloat(((presentDays / totalWorkingDays) * 100).toFixed(1))
      : 0;

    return {
      year, month, totalWorkingDays, presentDays,
      absentDays, leaveDays, halfDays,
      totalOTHours: parseFloat(totalOTHours.toFixed(2)),
      extraDays,
      attendancePercentage
    };
  }

  exportToCSV(records: AttendanceRecord[], filename: string): void {
    const headers = ['Date', 'Check In', 'Check Out', 'Worked Hours', 'OT Hours', 'Status', 'Notes'];
    const rows = records.map(r => [
      r.date,
      r.checkIn ?? '-',
      r.checkOut ?? '-',
      r.workedHours?.toFixed(2) ?? '-',
      r.otHours?.toFixed(2) ?? '0',
      r.status,
      r.notes ?? ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
