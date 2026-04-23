import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LeaveService } from '../../core/services/leave.service';
import { AttendanceRecord, LeaveRecord } from '../../core/models/user.model';

interface CalendarDay {
  date: string;
  day: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  dayOfWeek: number;
  record?: AttendanceRecord;
  leave?: LeaveRecord;
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

  currentYear = signal(new Date().getFullYear());
  currentMonth = signal(new Date().getMonth() + 1);
  calendarDays = signal<CalendarDay[]>([]);
  selectedDay = signal<CalendarDay | null>(null);
  records = signal<AttendanceRecord[]>([]);
  leaves = signal<LeaveRecord[]>([]);

  editCheckIn = '';
  editCheckOut = '';
  editNotes = '';
  isSaving = signal(false);
  saveMsg = signal('');
  saveError = signal('');
  showModal = signal(false);

  get monthName(): string {
    return new Date(this.currentYear(), this.currentMonth() - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  async ngOnInit() {
    await this.loadMonth();
  }

  async loadMonth() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    const [recs, leaves] = await Promise.all([
      this.attendanceSvc.getAttendanceForMonth(uid, this.currentYear(), this.currentMonth()),
      this.leaveSvc.getLeavesForMonth(uid, this.currentYear(), this.currentMonth())
    ]);
    this.records.set(recs);
    this.leaves.set(leaves);
    this.buildCalendar(recs, leaves);
  }

  buildCalendar(recs: AttendanceRecord[], leaves: LeaveRecord[]) {
    const y = this.currentYear();
    const m = this.currentMonth();
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const recMap = new Map(recs.map(r => [r.date, r]));
    const leaveMap = new Map(leaves.map(l => [l.date, l]));
    const days: CalendarDay[] = [];

    // Padding for first week
    const prevMonth = new Date(y, m - 1, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonth - i;
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      days.push({
        date: `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d, isToday: false, isCurrentMonth: false,
        dayOfWeek: new Date(py, pm - 1, d).getDay()
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        date: dateStr, day: d,
        isToday: dateStr === todayStr,
        isCurrentMonth: true,
        dayOfWeek: new Date(y, m - 1, d).getDay(),
        record: recMap.get(dateStr),
        leave: leaveMap.get(dateStr)
      });
    }

    // Fill remaining cells to complete the grid (6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      days.push({
        date: `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d, isToday: false, isCurrentMonth: false,
        dayOfWeek: new Date(ny, nm - 1, d).getDay()
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
    
    // Set default times if no record exists, otherwise use existing record
    this.editCheckIn = day.record?.checkIn ?? '08:00';
    this.editCheckOut = day.record?.checkOut ?? '17:00';
    this.editNotes = day.record?.notes ?? '';
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

    if (!this.editCheckIn) {
      this.saveError.set('Check-in time is required.');
      return;
    }
    if (this.editCheckOut && this.attendanceSvc['toMinutes'](this.editCheckOut) <= this.attendanceSvc['toMinutes'](this.editCheckIn)) {
      this.saveError.set('Check-out must be after check-in.');
      return;
    }

    this.isSaving.set(true);
    this.saveError.set('');
    try {
      const record: any = {
        date: day.date,
        checkIn: this.editCheckIn || null,
        checkOut: this.editCheckOut || null,
        status: this.editCheckIn ? 'present' : 'absent',
        notes: this.editNotes || null,
        workedHours: 0,
        otHours: 0
      };
      await this.attendanceSvc.saveAttendance(uid, record);
      this.saveMsg.set('Entry saved successfully.');
      await this.loadMonth();
      setTimeout(() => this.closeModal(), 800);
    } catch (e: any) {
      this.saveError.set(e.message ?? 'Failed to save.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async markAsHoliday() {
    const uid = this.auth.currentUser()?.uid;
    const day = this.selectedDay();
    if (!uid || !day) return;

    this.isSaving.set(true);
    try {
      const record: any = {
        date: day.date,
        status: 'holiday',
        notes: 'Public Holiday'
      };
      await this.attendanceSvc.saveAttendance(uid, record);
      await this.loadMonth();
      this.closeModal();
    } catch (e: any) {
      this.saveError.set(e.message);
    } finally {
      this.isSaving.set(false);
    }
  }

  async markAsSunday() {
    const uid = this.auth.currentUser()?.uid;
    const day = this.selectedDay();
    if (!uid || !day) return;

    this.isSaving.set(true);
    try {
      const record: any = {
        date: day.date,
        status: 'weekend',
        notes: 'Sunday'
      };
      await this.attendanceSvc.saveAttendance(uid, record);
      await this.loadMonth();
      this.closeModal();
    } catch (e: any) {
      this.saveError.set(e.message);
    } finally {
      this.isSaving.set(false);
    }
  }

  async markAsLeave() {
    const uid = this.auth.currentUser()?.uid;
    const day = this.selectedDay();
    if (!uid || !day) return;

    this.isSaving.set(true);
    try {
      const record: any = {
        date: day.date,
        status: 'leave',
        notes: 'Medical/Casual Leave'
      };
      // Save attendance record
      await this.attendanceSvc.saveAttendance(uid, record);
      // Also apply formal leave
      await this.leaveSvc.applyLeave(uid, {
        date: day.date,
        type: 'full',
        reason: 'Marked from Calendar'
      });
      
      await this.loadMonth();
      this.closeModal();
    } catch (e: any) {
      this.saveError.set(e.message);
    } finally {
      this.isSaving.set(false);
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
    if (day.record?.status === 'leave' || day.leave) classes.push('on-leave');
    return classes.join(' ');
  }

  getDayTypeLabel(day: CalendarDay): string {
    if (day.dayOfWeek === 0) return 'Holiday';
    if (day.dayOfWeek === 6) return 'Half Day';
    return '';
  }

  formatSelectedDate(): string {
    const d = this.selectedDay();
    if (!d) return '';
    return new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}
