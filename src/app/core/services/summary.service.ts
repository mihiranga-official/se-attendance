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
    let lateDays = 0;
    let totalLateMinutes = 0;
    let saturdayViolations = 0;
    let bonusLostDays = 0;
    let earlyLeaveDays = 0;
    let incompleteDays = 0;
    let bonusEligibleDays = 0;
    let twentyFourHourShifts = 0;
    let totalOvernightHours = 0;
    let freeMealEligibleDays = 0;

    const coveredDays = new Set<string>();
    records.forEach(r => {
      if (r.is24HourShift && r.checkInDate && r.checkOutDate && r.checkInDate !== r.checkOutDate) {
        coveredDays.add(r.checkOutDate);
      }
    });

    for (const day of workingDays) {
      const rec = recordMap.get(day);
      const leave = leaves.find(l => l.date === day);

      if (leave) {
        if (leave.type === 'full') leaveDays++;
        else { halfDays++; leaveDays += 0.5; }
        continue;
      }

      if (coveredDays.has(day)) {
        // This day is handled by the previous day's 24h shift record
        continue;
      }

      if (!rec || rec.status === 'absent') {
        absentDays++;
      } else if (rec.status === 'present' || rec.checkIn) {
        const is24hMulti = rec.is24HourShift && rec.checkInDate !== rec.checkOutDate;
        presentDays += is24hMulti ? 2 : 1;
        totalOTHours += rec.otHours ?? 0;
        
        if (rec.isLate) {
          lateDays++;
          totalLateMinutes += rec.lateMinutes ?? 0;
        }
        if (rec.isSaturdayViolation) {
          saturdayViolations++;
        }
        
        // Bonus calculation
        const bonuses = rec.bonusDaysEarned ?? (rec.lostBonus ? 0 : 1);
        const targetDays = is24hMulti ? 2 : 1;
        
        bonusEligibleDays += bonuses;
        bonusLostDays += (targetDays - bonuses);
        
        if (rec.actualStatus === 'Early Leave') earlyLeaveDays++;
        if (rec.actualStatus === 'Incomplete') incompleteDays++;
        if (rec.actualStatus === 'Half Day') halfDays++;
        
        if (rec.is24HourShift) {
          twentyFourHourShifts++;
          totalOvernightHours += rec.workedHours ?? 0;
        }
        if (rec.breakfastEligible || rec.nextDayLunchEligible) {
          freeMealEligibleDays++;
        }
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
      attendancePercentage,
      lateDays,
      totalLateMinutes,
      saturdayViolations,
      bonusLostDays,
      earlyLeaveDays,
      incompleteDays,
      bonusEligibleDays,
      twentyFourHourShifts,
      totalOvernightHours: parseFloat(totalOvernightHours.toFixed(2)),
      freeMealEligibleDays
    };
  }

  async getYearlySummary(uid: string, year: number): Promise<MonthlySummary> {
    const allMonths = await this.getPerformanceTrend(uid, year);

    return allMonths.reduce((acc, curr) => {
      return {
        ...acc,
        totalWorkingDays: acc.totalWorkingDays + curr.totalWorkingDays,
        presentDays: acc.presentDays + curr.presentDays,
        absentDays: acc.absentDays + curr.absentDays,
        leaveDays: acc.leaveDays + curr.leaveDays,
        halfDays: acc.halfDays + curr.halfDays,
        totalOTHours: acc.totalOTHours + curr.totalOTHours,
        extraDays: acc.extraDays + curr.extraDays,
        lateDays: acc.lateDays + curr.lateDays,
        totalLateMinutes: acc.totalLateMinutes + curr.totalLateMinutes,
        saturdayViolations: acc.saturdayViolations + curr.saturdayViolations,
        bonusLostDays: acc.bonusLostDays + curr.bonusLostDays,
        earlyLeaveDays: (acc.earlyLeaveDays || 0) + (curr.earlyLeaveDays || 0),
        incompleteDays: (acc.incompleteDays || 0) + (curr.incompleteDays || 0),
        bonusEligibleDays: (acc.bonusEligibleDays || 0) + (curr.bonusEligibleDays || 0),
        twentyFourHourShifts: (acc.twentyFourHourShifts || 0) + (curr.twentyFourHourShifts || 0),
        totalOvernightHours: (acc.totalOvernightHours || 0) + (curr.totalOvernightHours || 0),
        freeMealEligibleDays: (acc.freeMealEligibleDays || 0) + (curr.freeMealEligibleDays || 0)
      };
    });
  }

  async getPerformanceTrend(uid: string, year: number): Promise<MonthlySummary[]> {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return Promise.all(months.map(m => this.getMonthlySummary(uid, year, m)));
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
