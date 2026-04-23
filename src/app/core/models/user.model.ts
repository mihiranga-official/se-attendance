export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department?: string;
  position?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  date: string;          // YYYY-MM-DD
  checkIn?: string;      // HH:mm (24h)
  checkOut?: string;     // HH:mm (24h)
  workedHours?: number;
  otHours?: number;
  status: 'present' | 'absent' | 'leave' | 'half-day' | 'holiday' | 'weekend';
  notes?: string;
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
  attendancePercentage: number;
}
