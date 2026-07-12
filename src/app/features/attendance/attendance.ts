import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LeaveService } from '../../core/services/leave.service';
import { HolidayService } from '../../core/services/holiday.service';
import { CustomDialogService } from '../../core/services/custom-dialog.service';
import { AttendanceRecord, LeaveRecord, ShiftType } from '../../core/models/user.model';
import { UserService } from '../../core/services/user.service';
import { database } from '../../core/firebase.config';
import { ref, get } from 'firebase/database';

interface CalendarDay {
  date: string;
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  dayOfWeek: number;
  record?: AttendanceRecord;
  leave?: LeaveRecord;
  isContinuation?: boolean;
  isStart?: boolean;
  isEnd?: boolean;
  coveringFor?: LeaveRecord[];
  isPublicHoliday?: boolean;
  holidayName?: string;
  birthdays?: any[];
  specialEvent?: any;
  personalEvent?: any;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss'
})
export class AttendanceComponent implements OnInit {
  private auth = inject(AuthService);
  private attendanceSvc = inject(AttendanceService);
  private leaveSvc = inject(LeaveService);
  readonly holidaySvc = inject(HolidayService);
  private dialogSvc = inject(CustomDialogService);
  private userSvc = inject(UserService);

  currentYear = signal(new Date().getFullYear());
  currentMonth = signal(new Date().getMonth() + 1);
  calendarDays = signal<CalendarDay[]>([]);
  selectedDay = signal<CalendarDay | null>(null);
  records = signal<AttendanceRecord[]>([]);
  leaves = signal<LeaveRecord[]>([]);

  editCheckIn = '';
  editCheckInDate = '';
  editCheckOut = '';
  editCheckOutDate = '';
  editShiftType: ShiftType = 'normal';
  editNotes = '';
  editStatus: 'present' | 'leave' | 'holiday' | 'weekend' | 'covering' = 'present';
  editLeaveType: 'full' | 'half-morning' | 'half-afternoon' = 'full';
  editLeaveReason = '';
  editLeaveIsCovered = false;
  editLeaveCoveredByDate = '';
  editLeaveCoveredHours = 9;
  activeCoveringLeaves: LeaveRecord[] = [];
  editCoveringHoursValue = 9;
  isSaving = signal(false);
  saveMsg = signal('');
  saveError = signal('');
  showModal = signal(false);

  currentMonthName = computed(() => {
    return new Date(this.currentYear(), this.currentMonth() - 1).toLocaleString('default', { month: 'long' });
  });

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async ngOnInit() {
    await this.loadMonth();
  }

  async loadMonth() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    await this.holidaySvc.ensureLoaded();
    const [recs, leaves, users, specialEventsSnap, personalEventsSnap] = await Promise.all([
      this.attendanceSvc.getAttendanceForMonth(uid, this.currentYear(), this.currentMonth()),
      this.leaveSvc.getLeavesForMonth(uid, this.currentYear(), this.currentMonth()),
      this.userSvc.getAllUsers(),
      get(ref(database, 'specialEvents')),
      get(ref(database, `users/${uid}/personalEvents`))
    ]);

    const specialEvents = specialEventsSnap.exists()
      ? Object.values(specialEventsSnap.val()).filter((e: any) => e.target === 'all' || e.targetUid === uid)
      : [];
    const personalEvents = personalEventsSnap.exists()
      ? Object.values(personalEventsSnap.val())
      : [];

    this.records.set(recs);
    this.leaves.set(leaves);
    this.buildCalendar(recs, leaves, users, specialEvents, personalEvents);
  }

  buildCalendar(recs: AttendanceRecord[], leaves: LeaveRecord[], users: any[] = [], specialEvents: any[] = [], personalEvents: any[] = []) {
    const y = this.currentYear();
    const m = this.currentMonth();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const recMap = new Map(recs.map(r => [r.date, r]));
    const leaveMap = new Map(leaves.map(l => [l.date, l]));

    // Map of coveringDate -> LeaveRecord[]
    const coveringMap = new Map<string, LeaveRecord[]>();
    leaves.forEach(l => {
      if (l.isCovered && l.coveredByDate) {
        const list = coveringMap.get(l.coveredByDate) || [];
        list.push(l);
        coveringMap.set(l.coveredByDate, list);
      }
    });

    // Track days covered by multi-day shifts
    const startMap = new Map<string, AttendanceRecord>();
    const endMap = new Map<string, AttendanceRecord>();
    const spanMap = new Map<string, AttendanceRecord>();
    
    recs.forEach(r => {
      if (r.checkOutDate && r.checkOutDate > r.date) {
        startMap.set(r.date, r);
        endMap.set(r.checkOutDate, r);
        
        let curr = new Date(r.date + 'T00:00:00');
        let end = new Date(r.checkOutDate + 'T00:00:00');
        curr.setDate(curr.getDate() + 1);
        while (curr < end) { // Only intermediate days
          const ds = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
          spanMap.set(ds, r);
          curr.setDate(curr.getDate() + 1);
        }
      } else {
        // Normal shift - both start and end on same day
        // But for visual clarity, we treat it as a standard record in recMap
      }
    });

    const getBirthdaysForDate = (dateStr: string) => {
      const [currY, currM, currD] = dateStr.split('-').map(Number);
      return users.filter(u => {
        if (!u.dob) return false;
        const [by, bm, bd] = u.dob.split('-').map(Number);
        return bm === currM && bd === currD;
      });
    };

    const getEffectiveRecord = (dateStr: string, dayOfWeekVal: number) => {
      const existingRecord = recMap.get(dateStr) || spanMap.get(dateStr) || endMap.get(dateStr);
      if (existingRecord) return existingRecord;

      let isSaturdayCovered = false;
      if (dayOfWeekVal === 6) { // Saturday
        let totalOT = 0;
        const date = new Date(dateStr + 'T00:00:00');
        const monday = new Date(date);
        monday.setDate(date.getDate() - 5);
        for (let i = 0; i < 5; i++) {
          const dObj = new Date(monday);
          dObj.setDate(monday.getDate() + i);
          const dStr = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
          const r = recMap.get(dStr);
          if (r && r.otHours) {
            totalOT += r.otHours;
          }
        }
        if (totalOT >= 5) {
          isSaturdayCovered = true;
        }
      }

      if (isSaturdayCovered) {
        return {
          date: dateStr,
          status: 'Saturday Covered' as const,
          actualStatus: 'Saturday Covered' as const,
          notes: 'Saturday Covered by Weekly OT',
          workedHours: 0,
          otHours: 0
        };
      }

      const isPublicHoliday = this.holidaySvc.isHoliday(dateStr);
      if (isPublicHoliday) {
        const holidayName = this.holidaySvc.getHolidayName(dateStr) ?? 'Public Holiday';
        return {
          date: dateStr,
          status: 'holiday' as const,
          notes: holidayName,
          workedHours: 0,
          otHours: 0
        };
      }

      return undefined;
    };

    const days: CalendarDay[] = [];

    // Padding for first week
    const prevMonth = new Date(y, m - 1, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonth - i;
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      const dateStr = `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeekVal = new Date(py, pm - 1, d).getDay();
      days.push({
        date: dateStr,
        day: d, isToday: false, isCurrentMonth: false,
        dayOfWeek: dayOfWeekVal,
        record: getEffectiveRecord(dateStr, dayOfWeekVal),
        isStart: startMap.has(dateStr),
        isEnd: endMap.has(dateStr),
        isContinuation: spanMap.has(dateStr),
        coveringFor: coveringMap.get(dateStr),
        birthdays: getBirthdaysForDate(dateStr),
        specialEvent: specialEvents.find((e: any) => e.date === dateStr),
        personalEvent: personalEvents.find((e: any) => e.date === dateStr)
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPublicHoliday = this.holidaySvc.isHoliday(dateStr);
      const holidayName = this.holidaySvc.getHolidayName(dateStr) ?? undefined;
      const dayOfWeekVal = new Date(y, m - 1, d).getDay();
      days.push({
        date: dateStr, day: d,
        isToday: dateStr === todayStr,
        isCurrentMonth: true,
        dayOfWeek: dayOfWeekVal,
        record: getEffectiveRecord(dateStr, dayOfWeekVal),
        isStart: startMap.has(dateStr),
        isEnd: endMap.has(dateStr),
        isContinuation: spanMap.has(dateStr),
        leave: leaveMap.get(dateStr),
        coveringFor: coveringMap.get(dateStr),
        isPublicHoliday,
        holidayName,
        birthdays: getBirthdaysForDate(dateStr),
        specialEvent: specialEvents.find((e: any) => e.date === dateStr),
        personalEvent: personalEvents.find((e: any) => e.date === dateStr)
      });
    }

    // Fill remaining cells to complete the grid (6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const dateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeekVal = new Date(ny, nm - 1, d).getDay();
      days.push({
        date: dateStr,
        day: d, isToday: false, isCurrentMonth: false,
        dayOfWeek: dayOfWeekVal,
        record: getEffectiveRecord(dateStr, dayOfWeekVal),
        isStart: startMap.has(dateStr),
        isEnd: endMap.has(dateStr),
        isContinuation: spanMap.has(dateStr),
        coveringFor: coveringMap.get(dateStr),
        birthdays: getBirthdaysForDate(dateStr),
        specialEvent: specialEvents.find((e: any) => e.date === dateStr),
        personalEvent: personalEvents.find((e: any) => e.date === dateStr)
      });
    }

    this.calendarDays.set(days);
  }

  prevMonth() {
    if (this.currentMonth() === 1) {
      this.currentMonth.set(12);
      this.currentYear.update(y => y - 1);
    } else {
      this.currentMonth.update(m => m - 1);
    }
    this.loadMonth();
  }

  nextMonth() {
    if (this.currentMonth() === 12) {
      this.currentMonth.set(1);
      this.currentYear.update(y => y + 1);
    } else {
      this.currentMonth.update(m => m + 1);
    }
    this.loadMonth();
  }

  selectDay(day: CalendarDay) {
    if (!day.isCurrentMonth) return;
    this.selectedDay.set(day);

    // Set default values
    this.editCheckIn = day.record?.checkIn ?? '08:00';
    this.editCheckInDate = day.record?.checkInDate ?? day.date;
    this.editCheckOut = day.record?.checkOut ?? '17:00';
    this.editCheckOutDate = day.record?.checkOutDate ?? day.date;
    this.editShiftType = (day.record?.shiftType as ShiftType) ?? 'normal';
    this.editNotes = day.record?.notes ?? '';

    // Initialize editStatus
    if (day.coveringFor && day.coveringFor.length > 0) {
      this.editStatus = 'covering';
    } else if (day.record?.status) {
      this.editStatus = day.record.status as any;
    } else if (day.leave) {
      this.editStatus = 'leave';
    } else {
      this.editStatus = 'present';
    }

    // Initialize leave details
    if (day.leave) {
      this.editLeaveType = day.leave.type || 'full';
      this.editLeaveReason = day.leave.reason || '';
      this.editLeaveIsCovered = day.leave.isCovered || false;
      this.editLeaveCoveredByDate = day.leave.coveredByDate || day.date;
      this.editLeaveCoveredHours = day.leave.coveredHours ?? (day.leave.type === 'full' ? 9 : 4.5);
    } else if (day.record?.status === 'leave') {
      this.editLeaveType = 'full';
      this.editLeaveReason = day.record.notes || 'Medical/Casual Leave';
      this.editLeaveIsCovered = false;
      this.editLeaveCoveredByDate = day.date;
      this.editLeaveCoveredHours = 9;
    } else {
      this.editLeaveType = 'full';
      this.editLeaveReason = '';
      this.editLeaveIsCovered = false;
      this.editLeaveCoveredByDate = day.date;
      this.editLeaveCoveredHours = 9;
    }

    // Initialize covering day details
    this.activeCoveringLeaves = day.coveringFor || [];
    if (this.activeCoveringLeaves.length > 0) {
      const active = this.activeCoveringLeaves[0];
      this.editCoveringHoursValue = active.coveredHours ?? (active.type === 'full' ? 9 : 4.5);
    } else {
      this.editCoveringHoursValue = 9;
    }

    this.saveMsg.set('');
    this.saveError.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.selectedDay.set(null);
  }

  async saveEntry() {
    const uid = this.auth.currentUser()?.uid;
    const day = this.selectedDay();
    if (!uid || !day) return;

    this.isSaving.set(true);
    this.saveError.set('');
    this.saveMsg.set('');

    try {
      if (this.editLeaveIsCovered && !this.editLeaveCoveredByDate) {
        this.saveError.set('Covering date is required.');
        this.isSaving.set(false);
        return;
      }

      // Save primary attendance record
      if (this.editStatus === 'present' || this.editStatus === 'covering') {
        if (!this.editCheckIn) {
          this.saveError.set('Check-in time is required.');
          this.isSaving.set(false);
          return;
        }
        if (this.editCheckOut && this.editCheckIn) {
          const checkInDate = this.editShiftType === '24h' ? (this.editCheckInDate || day.date) : day.date;
          const checkOutDate = this.editShiftType === '24h' ? (this.editCheckOutDate || day.date) : day.date;
          
          const startDateTime = new Date(`${checkInDate}T${this.editCheckIn}`);
          const endDateTime = new Date(`${checkOutDate}T${this.editCheckOut}`);
          
          if (endDateTime <= startDateTime) {
            this.saveError.set('Check-out must be after Check-in.');
            this.isSaving.set(false);
            return;
          }
        }

        const record: AttendanceRecord = {
          date: day.date,
          checkInDate: this.editShiftType === '24h' ? (this.editCheckInDate || day.date) : day.date,
          checkIn: this.editCheckIn || '',
          checkOutDate: this.editShiftType === '24h' ? (this.editCheckOutDate || day.date) : day.date,
          checkOut: this.editCheckOut || '',
          shiftType: this.editShiftType || 'normal',
          status: 'present',
          notes: this.editNotes || '',
        };
        await this.attendanceSvc.saveAttendance(uid, record);
      } 
      else if (this.editStatus === 'leave') {
        if (!this.editLeaveReason) {
          this.saveError.set('Leave reason is required.');
          this.isSaving.set(false);
          return;
        }

        const record: AttendanceRecord = {
          date: day.date,
          status: 'leave',
          notes: this.editLeaveReason || 'Medical/Casual Leave'
        };
        await this.attendanceSvc.saveAttendance(uid, record);
      } 
      else if (this.editStatus === 'holiday') {
        const record: AttendanceRecord = {
          date: day.date,
          status: 'holiday',
          notes: this.editNotes || 'Public Holiday'
        };
        await this.attendanceSvc.saveAttendance(uid, record);
      } 
      else if (this.editStatus === 'weekend') {
        const record: AttendanceRecord = {
          date: day.date,
          status: 'weekend',
          notes: this.editNotes || 'Sunday'
        };
        await this.attendanceSvc.saveAttendance(uid, record);
      }

      // Handle leave/coverage record
      if (day.leave) {
        await this.leaveSvc.deleteLeave(uid, day.leave.leaveId);
      }

      if (this.editLeaveIsCovered || this.editStatus === 'leave') {
        let reason = '';
        if (this.editStatus === 'leave') {
          reason = this.editLeaveReason || 'Medical/Casual Leave';
        } else if (this.editStatus === 'holiday') {
          reason = this.editNotes || 'Public Holiday Coverage';
        } else if (this.editStatus === 'weekend') {
          reason = this.editNotes || 'Weekend / Sunday Coverage';
        } else {
          reason = this.editNotes || 'Present Day Coverage';
        }

        const leaveData: any = {
          date: day.date,
          type: this.editLeaveType,
          reason: reason
        };

        if (this.editLeaveIsCovered) {
          leaveData.isCovered = true;
          leaveData.coveredByDate = this.editLeaveCoveredByDate;
          leaveData.coveredHours = this.editLeaveCoveredHours;
        }

        await this.leaveSvc.applyLeave(uid, leaveData);
      }

      // If this day covers another day's leave, update the covered hours in the leave record
      if (this.activeCoveringLeaves.length > 0) {
        const leaveToUpdate = this.activeCoveringLeaves[0];
        await this.leaveSvc.updateLeaveCoveredHours(uid, leaveToUpdate.leaveId, this.editCoveringHoursValue);
      }

      this.saveMsg.set('Entry saved successfully.');
      await this.loadMonth();
      setTimeout(() => this.closeModal(), 800);
    } catch (e: any) {
      this.saveError.set(e.message ?? 'Failed to save.');
    } finally {
      this.isSaving.set(false);
    }
  }

  markAsHoliday() {
    this.editStatus = 'holiday';
    this.onStatusChange();
  }

  onShiftTypeChange() {
    if (this.editShiftType === '24h' && this.selectedDay()) {
      if (!this.editCheckInDate) this.editCheckInDate = this.selectedDay()!.date;
      if (!this.editCheckOutDate) {
        const nextDay = new Date(this.selectedDay()!.date + 'T00:00:00');
        nextDay.setDate(nextDay.getDate() + 1);
        this.editCheckOutDate = nextDay.toISOString().split('T')[0];
      }
    }
  }

  markAsSunday() {
    this.editStatus = 'weekend';
    this.onStatusChange();
  }

  markAsLeave() {
    this.editStatus = 'leave';
    this.onStatusChange();
  }

  onStatusChange() {
    if (this.editStatus === 'holiday' && !this.editNotes) {
      this.editNotes = 'Public Holiday';
    } else if (this.editStatus === 'weekend' && !this.editNotes) {
      this.editNotes = 'Sunday';
    } else if (this.editStatus === 'leave') {
      if (!this.editLeaveReason) this.editLeaveReason = 'Medical/Casual Leave';
      if (!this.editLeaveCoveredByDate && this.selectedDay()) {
        this.editLeaveCoveredByDate = this.selectedDay()!.date;
      }
    }
  }

  getDayClass(day: CalendarDay): string {
    const classes: string[] = [];
    if (!day.isCurrentMonth) classes.push('outside');
    if (day.isToday) classes.push('today');
    if (day.dayOfWeek === 0) classes.push('sunday');
    if (day.dayOfWeek === 6) classes.push('saturday');
    if (day.record?.checkIn && !day.record?.checkOut) classes.push('missing-checkout');
    if (day.record?.checkIn && day.record?.checkOut) classes.push('completed');
    if (day.record?.status === 'leave' || day.leave) {
      classes.push('on-leave');
      if (day.leave?.isCovered) {
        const reqHours = day.leave.type === 'full' ? 9 : 4.5;
        const covHours = day.leave.coveredHours ?? 0;
        if (covHours < reqHours) {
          classes.push('on-leave-partially-covered');
        } else {
          classes.push('on-leave-covered');
        }
      }
    }
    if (day.coveringFor && day.coveringFor.length > 0) {
      classes.push('is-covering-day');
      const active = day.coveringFor[0];
      const reqHours = active.type === 'full' ? 9 : 4.5;
      const covHours = active.coveredHours ?? 0;
      if (covHours < reqHours) {
        classes.push('is-covering-day-incomplete');
      }
    }
    return classes.join(' ');
  }

  getDayTypeLabel(day: CalendarDay): string {
    if (day.dayOfWeek === 0) return 'Off Day';
    if (day.dayOfWeek === 6) return 'Full Day';
    return '';
  }

  formatSelectedDate(): string {
    const d = this.selectedDay();
    if (!d) return '';
    return new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  async removeAttendance() {
    const uid = this.auth.currentUser()?.uid;
    const day = this.selectedDay();
    if (!uid || !day) return;

    const isConfirmed = await this.dialogSvc.confirm('Remove Attendance', 'Are you sure you want to remove this attendance record?');
    if (!isConfirmed) return;

    this.isSaving.set(true);
    this.saveError.set('');
    try {
      if (day.record) {
        await this.attendanceSvc.deleteAttendance(uid, day.date);
      }
      if (day.leave) {
        await this.leaveSvc.deleteLeave(uid, day.leave.leaveId);
      }

      // Also catch if neither existed, but the user clicked remove
      if (!day.record && !day.leave) {
        await this.attendanceSvc.deleteAttendance(uid, day.date); // Fallback
      }

      this.saveMsg.set('Attendance record removed successfully.');
      await this.loadMonth();
      setTimeout(() => this.closeModal(), 800);
    } catch (e: any) {
      this.saveError.set(e.message ?? 'Failed to remove record.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
