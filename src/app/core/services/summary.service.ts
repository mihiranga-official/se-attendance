import { Injectable } from '@angular/core';
import { AttendanceRecord, MonthlySummary, DateRangeSummary } from '../models/user.model';
import { AttendanceService } from './attendance.service';
import { LeaveService } from './leave.service';

@Injectable({ providedIn: 'root' })
export class SummaryService {

  constructor(
    private attendanceService: AttendanceService,
    private leaveService: LeaveService
  ) {}

  async getMonthlySummary(uid: string, year: number, month: number): Promise<MonthlySummary> {
    const workingDays = await this.attendanceService.getWorkingDaysInMonth(year, month);
    const records = await this.attendanceService.getAttendanceForMonth(uid, year, month);
    const leaves = await this.leaveService.getLeavesForMonth(uid, year, month);

    const recordMap = new Map(records.map(r => [r.date, r]));

    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let halfDays = 0;
    let unpaidLeaveHours = 0;
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
      totalOTHours += r.otHours ?? 0;
      if (r.is24HourShift && r.checkInDate && r.checkOutDate && r.checkInDate !== r.checkOutDate) {
        coveredDays.add(r.checkOutDate);
      }
    });

    // Requirement 6: If user did covering days, deduct covering hours from OT hours
    let totalCoveredHoursDeduction = 0;
    let overtimeCoveredLeaves = 0;
    leaves.forEach(l => {
      if (l.isCovered || l.isOvertimeCovered) {
        overtimeCoveredLeaves++;
        const requiredHours = l.type === 'full' ? 9 : 4.5;
        const covered = l.coveredHours ?? requiredHours;
        totalCoveredHoursDeduction += covered;
      }
    });

    const grossOTHours = totalOTHours;
    totalOTHours = Math.max(0, parseFloat((totalOTHours - totalCoveredHoursDeduction).toFixed(2)));

    const todayStr = this.attendanceService.getTodayStr();

    for (const day of workingDays) {
      const rec = recordMap.get(day);
      const leave = leaves.find(l => l.date === day);

      if (leave) {
        const isSaturdayLeave = new Date(day + 'T00:00:00').getDay() === 6;
        const fullDayHours = isSaturdayLeave ? 5 : 9;
        const halfDayHours = isSaturdayLeave ? 2.5 : 4.5;

        let unpaidHoursForThisLeave = 0;
        if (leave.isCovered || leave.isOvertimeCovered) {
          const requiredHours = leave.type === 'full' ? fullDayHours : halfDayHours;
          const coveredHours = leave.coveredHours ?? requiredHours;
          unpaidHoursForThisLeave = Math.max(0, requiredHours - coveredHours);
        } else {
          unpaidHoursForThisLeave = leave.type === 'full' ? fullDayHours : halfDayHours;
        }
        unpaidLeaveHours += unpaidHoursForThisLeave;

        if (leave.type === 'full') { leaveDays++; }
        else { halfDays++; leaveDays += 0.5; }
        continue;
      }

      // Requirement 2: If day was checkout day of 24h shift, but user arrived again on that day, do NOT skip!
      if (coveredDays.has(day) && !rec?.checkIn) {
        // This day is handled by the previous day's 24h shift record
        continue;
      }

      const isFutureDay = day > todayStr;
      const isToday = day === todayStr;

      if (!rec || rec?.status === 'absent') {
        // Only count past days (day < todayStr) as absent!
        // Future days have not occurred yet, and today is in progress unless explicitly marked absent.
        if (!isFutureDay && (!isToday || rec?.status === 'absent')) {
          absentDays++;
        }
      } else if (rec?.status === 'present' || rec?.status === 'Saturday Covered' || rec?.checkIn) {
        const attendedDaysEarned = this.attendanceService.getAttendedDaysEarned(rec);
        presentDays += attendedDaysEarned;
        
        if (rec?.isLate) {
          lateDays++;
          totalLateMinutes += rec.lateMinutes ?? 0;
        }
        if (rec?.isSaturdayViolation) {
          saturdayViolations++;
        }
        
        // Bonus calculation (strict full-day on-time criteria)
        const is24h = !!(rec?.is24HourShift && rec?.checkInDate && rec?.checkOutDate && rec?.checkInDate !== rec?.checkOutDate);
        const targetDays = is24h ? 2 : 1;
        const fullDays = this.attendanceService.getFullDaysEarned(rec);
        const bonuses = rec?.bonusDaysEarned ?? fullDays;
        
        bonusEligibleDays += bonuses;
        bonusLostDays += Math.max(0, targetDays - bonuses);
        
        if (rec?.actualStatus === 'Early Leave') earlyLeaveDays++;
        if (rec?.actualStatus === 'Incomplete') incompleteDays++;
        if (rec?.actualStatus === 'Half Day') halfDays++;
        
        if (rec?.is24HourShift) {
          twentyFourHourShifts++;
          totalOvernightHours += rec.workedHours ?? 0;
        }
        if (rec?.breakfastEligible || rec?.nextDayLunchEligible) {
          freeMealEligibleDays++;
        }
      }
    }

    // Count extra days (worked Sundays)
    const allRecords = records;
    for (const rec of allRecords) {
      const isSunday = new Date(rec.date + 'T00:00:00').getDay() === 0;
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
      grossOTHours: parseFloat(grossOTHours.toFixed(2)),
      coveredHoursDeducted: parseFloat(totalCoveredHoursDeduction.toFixed(2)),
      overtimeCoveredLeaves,
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
      freeMealEligibleDays,
      unpaidLeaveHours
    };
  }

  async getYearlySummary(uid: string, year: number): Promise<MonthlySummary> {
    const allMonths = await this.getPerformanceTrend(uid, year);

    const aggregated = allMonths.reduce((acc, curr) => {
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
        freeMealEligibleDays: (acc.freeMealEligibleDays || 0) + (curr.freeMealEligibleDays || 0),
        unpaidLeaveHours: (acc.unpaidLeaveHours || 0) + (curr.unpaidLeaveHours || 0)
      };
    });

    aggregated.attendancePercentage = aggregated.totalWorkingDays > 0
      ? parseFloat(((aggregated.presentDays / aggregated.totalWorkingDays) * 100).toFixed(1))
      : 0;

    return aggregated;
  }

  async getPerformanceTrend(uid: string, year: number): Promise<MonthlySummary[]> {
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return Promise.all(months.map(m => this.getMonthlySummary(uid, year, m)));
  }

  async getDateRangeSummary(uid: string, startDate: string, endDate: string): Promise<DateRangeSummary> {
    const workingDays = await this.attendanceService.getWorkingDaysBetween(startDate, endDate);
    const records = await this.attendanceService.getAttendanceForDateRange(uid, startDate, endDate);
    const leaves = await this.leaveService.getLeavesForDateRange(uid, startDate, endDate);

    // Calculate total calendar days
    const startObj = new Date(startDate + 'T00:00:00');
    const endObj = new Date(endDate + 'T00:00:00');
    const totalCalendarDays = Math.max(0, Math.round((endObj.getTime() - startObj.getTime()) / (1000 * 3600 * 24)) + 1);

    let grossOTHours = 0;
    let totalWorkedHours = 0;
    let totalSundayWorkedDays = 0;
    let totalSaturdayWorkedDays = 0;
    let lateDays = 0;
    let totalLateMinutes = 0;
    let twentyFourHourShifts = 0;
    let attendedDays = 0;

    const coveredDays = new Set<string>();
    records.forEach(r => {
      grossOTHours += r.otHours ?? 0;
      totalWorkedHours += r.workedHours ?? 0;
      if (r.isLate) {
        lateDays++;
        totalLateMinutes += r.lateMinutes ?? 0;
      }
      if (r.is24HourShift) {
        twentyFourHourShifts++;
        if (r.checkInDate && r.checkOutDate && r.checkInDate !== r.checkOutDate) {
          coveredDays.add(r.checkOutDate);
        }
      }

      const recDay = new Date(r.date + 'T00:00:00').getDay();
      const isAttended = r.status === 'present' || r.status === 'Saturday Covered' || !!r.checkIn;

      if (isAttended) {
        if (recDay === 0) totalSundayWorkedDays++;
        if (recDay === 6) totalSaturdayWorkedDays++;

        // Calculate attended days count using standard attended days rule
        attendedDays += this.attendanceService.getAttendedDaysEarned(r);
      }
    });

    // Leave metrics & covered hour deductions
    let totalCoveredHoursDeduction = 0;
    let totalCoveredLeaves = 0;
    let totalLeaveDays = 0;
    const leaveBreakdown = {
      casual: 0,
      annual: 0,
      unpaid: 0,
      halfDays: 0,
      covered: 0
    };

    leaves.forEach(l => {
      const isHalf = l.type !== 'full';
      const weight = isHalf ? 0.5 : 1.0;
      totalLeaveDays += weight;

      if (isHalf) leaveBreakdown.halfDays++;

      const isSaturday = new Date(l.date + 'T00:00:00').getDay() === 6;
      const requiredHours = isHalf ? (isSaturday ? 2.5 : 4.5) : (isSaturday ? 5 : 9);

      if (l.isCovered || l.isOvertimeCovered) {
        totalCoveredLeaves++;
        leaveBreakdown.covered += weight;
        const covered = l.coveredHours ?? requiredHours;
        totalCoveredHoursDeduction += covered;
      }

      const cat = l.leaveCategory || 'unpaid';
      if (cat === 'casual') leaveBreakdown.casual += weight;
      else if (cat === 'annual') leaveBreakdown.annual += weight;
      else leaveBreakdown.unpaid += weight;
    });

    const netOTHours = Math.max(0, parseFloat((grossOTHours - totalCoveredHoursDeduction).toFixed(2)));
    const totalWorkingDays = workingDays.length;
    const attendancePercentage = totalWorkingDays > 0
      ? parseFloat(((attendedDays / totalWorkingDays) * 100).toFixed(1))
      : 0;

    return {
      startDate,
      endDate,
      totalCalendarDays,
      totalWorkingDays,
      attendedDays: parseFloat(attendedDays.toFixed(1)),
      attendancePercentage,
      totalLeaveDays: parseFloat(totalLeaveDays.toFixed(1)),
      leaveBreakdown,
      totalSundayWorkedDays,
      totalSaturdayWorkedDays,
      totalOTHours: netOTHours,
      grossOTHours: parseFloat(grossOTHours.toFixed(2)),
      coveredHoursDeducted: parseFloat(totalCoveredHoursDeduction.toFixed(2)),
      totalWorkedHours: parseFloat(totalWorkedHours.toFixed(2)),
      totalCoveredLeaves,
      lateDays,
      totalLateMinutes,
      twentyFourHourShifts,
      recordsCount: records.length
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
