export interface LeaveCategoryBalance {
  allocated: number;
  used: number;
}

export interface LeaveBalances {
  casual: LeaveCategoryBalance;
  annual: LeaveCategoryBalance;
  sick?: LeaveCategoryBalance;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department?: string;
  position?: string;
  fcmToken?: string;
  createdAt: string;
  dob?: string; // YYYY-MM-DD
  photoUrl?: string;
  isFoodSubscribed?: boolean;
  leaveBalances?: LeaveBalances;
}

export type ShiftType = 'normal' | '24h';
export type ActualStatus = 'Completed' | 'Incomplete' | 'Half Day' | 'Early Leave' | 'Late Arrival' | 'Overnight Shift' | '24 Hour Shift' | 'Bonus Eligible' | 'Bonus Lost' | 'Saturday Covered' | 'Sunday Work' | 'Holiday Work';

export interface BonusDetail {
  date: string;
  isEligible: boolean;
  reason?: string;
}

export interface AttendanceRecord {
  date: string;          // YYYY-MM-DD
  checkIn?: string;      // HH:mm (24h)
  checkOut?: string;     // HH:mm (24h)
  workedHours?: number;
  otHours?: number;
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'holiday' | 'weekend' | 'Saturday Covered';
  notes?: string;
  isLate?: boolean;
  lateMinutes?: number;
  lostFullDay?: boolean;
  lostBonus?: boolean;
  isSaturdayViolation?: boolean;
  
  shiftType?: ShiftType;
  is24HourShift?: boolean;
  breakfastEligible?: boolean;
  nextDayLunchEligible?: boolean;
  actualStatus?: ActualStatus;
  checkOutDate?: string; // To handle cross-day checkout
  checkInDate?: string;  // To handle multi-day start if needed
  bonusDetails?: BonusDetail[];
  bonusDaysEarned?: number;
  isPostOvernightShift?: boolean;
  overnightCheckOutTime?: string;
}

export interface LeaveRecord {
  leaveId: string;
  date: string;          // YYYY-MM-DD
  endDate?: string;      // for multi-day leaves
  type: 'full' | 'half-morning' | 'half-afternoon';
  leaveCategory?: 'casual' | 'annual' | 'total' | 'other';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  approvedBy?: string;
  isCovered?: boolean;
  coveredByDate?: string;
  coveredHours?: number;
  isOvertimeCovered?: boolean;
}

export interface MonthlySummary {
  year: number;
  month: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  totalOTHours: number;
  grossOTHours?: number;
  coveredHoursDeducted?: number;
  overtimeCoveredLeaves?: number;
  extraDays: number;
  attendancePercentage: number;
  lateDays: number;
  totalLateMinutes: number;
  saturdayViolations: number;
  bonusLostDays: number;
  
  earlyLeaveDays?: number;
  incompleteDays?: number;
  bonusEligibleDays?: number;
  twentyFourHourShifts?: number;
  totalOvernightHours?: number;
  freeMealEligibleDays?: number;
  unpaidLeaveHours?: number;
}

export interface YearlySummary {
  year: number;
  totalWorkingDays: number;
  presentDays: number;
  lateDays: number;
  earlyLeaves: number;
  halfDays: number;
  incompleteDays: number;
  twentyFourHourShifts: number;
  totalOTHours: number;
  freeMealEligibleDays: number;
  bonusEligibleDays: number;
  bonusLostDays: number;
}

export interface DateRangeLeaveBreakdown {
  casual: number;
  annual: number;
  unpaid: number;
  halfDays: number;
  covered: number;
}

export interface DateRangeSummary {
  startDate: string;
  endDate: string;
  totalCalendarDays: number;
  totalWorkingDays: number;
  attendedDays: number;
  attendancePercentage: number;
  totalLeaveDays: number;
  leaveBreakdown: DateRangeLeaveBreakdown;
  totalSundayWorkedDays: number;
  totalSaturdayWorkedDays: number;
  totalOTHours: number;
  grossOTHours: number;
  coveredHoursDeducted: number;
  totalWorkedHours: number;
  totalCoveredLeaves: number;
  lateDays: number;
  totalLateMinutes: number;
  twentyFourHourShifts: number;
  recordsCount: number;
}
