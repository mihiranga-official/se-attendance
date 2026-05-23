export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department?: string;
  position?: string;
  fcmToken?: string;
  createdAt: string;
}

export type ShiftType = 'normal' | '24h';
export type ActualStatus = 'Completed' | 'Incomplete' | 'Half Day' | 'Early Leave' | 'Late Arrival' | 'Overnight Shift' | '24 Hour Shift' | 'Bonus Eligible' | 'Bonus Lost';

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
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'holiday' | 'weekend';
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
}

export interface LeaveRecord {
  leaveId: string;
  date: string;          // YYYY-MM-DD
  endDate?: string;      // for multi-day leaves
  type: 'full' | 'half-morning' | 'half-afternoon';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  approvedBy?: string;
  isCovered?: boolean;
  coveredByDate?: string;
  coveredHours?: number;
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
