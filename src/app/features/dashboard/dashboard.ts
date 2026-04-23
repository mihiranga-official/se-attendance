import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { SummaryService } from '../../core/services/summary.service';
import { AttendanceRecord, MonthlySummary } from '../../core/models/user.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private attendanceSvc = inject(AttendanceService);
  private summarySvc = inject(SummaryService);

  today = new Date();
  todayStr = this.attendanceSvc.getTodayStr();
  currentTime = signal(this.attendanceSvc.getCurrentTimeStr());

  todayRecord = signal<AttendanceRecord | null>(null);
  monthlySummary = signal<MonthlySummary | null>(null);
  recentRecords = signal<AttendanceRecord[]>([]);

  isCheckingIn = signal(false);
  isCheckingOut = signal(false);
  actionMsg = signal('');
  actionError = signal('');

  get greeting(): string {
    const h = this.today.getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  get dayLabel(): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[this.today.getDay()];
  }

  get todayFormatted(): string {
    return this.today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  get isSunday(): boolean { return this.today.getDay() === 0; }
  get isSaturday(): boolean { return this.today.getDay() === 6; }

  async ngOnInit() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    // Update clock every minute
    setInterval(() => this.currentTime.set(this.attendanceSvc.getCurrentTimeStr()), 60000);

    const [rec, summary, recent] = await Promise.all([
      this.attendanceSvc.getAttendanceForDate(uid, this.todayStr),
      this.summarySvc.getMonthlySummary(uid, this.today.getFullYear(), this.today.getMonth() + 1),
      this.attendanceSvc.getAttendanceForMonth(uid, this.today.getFullYear(), this.today.getMonth() + 1)
    ]);

    this.todayRecord.set(rec);
    this.monthlySummary.set(summary);
    this.recentRecords.set(recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7));
  }

  async checkIn() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    this.isCheckingIn.set(true);
    this.actionError.set('');
    this.actionMsg.set('');
    try {
      await this.attendanceSvc.checkIn(uid);
      const rec = await this.attendanceSvc.getAttendanceForDate(uid, this.todayStr);
      this.todayRecord.set(rec);
      this.actionMsg.set(`✓ Checked in at ${rec?.checkIn}`);
    } catch (e: any) {
      this.actionError.set(e.message);
    } finally {
      this.isCheckingIn.set(false);
    }
  }

  async checkOut() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    this.isCheckingOut.set(true);
    this.actionError.set('');
    this.actionMsg.set('');
    try {
      await this.attendanceSvc.checkOut(uid);
      const rec = await this.attendanceSvc.getAttendanceForDate(uid, this.todayStr);
      this.todayRecord.set(rec);
      this.actionMsg.set(`✓ Checked out at ${rec?.checkOut} | Worked: ${rec?.workedHours?.toFixed(2)}h | OT: ${rec?.otHours?.toFixed(2)}h`);
      await this.refreshSummary();
    } catch (e: any) {
      this.actionError.set(e.message);
    } finally {
      this.isCheckingOut.set(false);
    }
  }

  async refreshSummary() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    const summary = await this.summarySvc.getMonthlySummary(uid, this.today.getFullYear(), this.today.getMonth() + 1);
    this.monthlySummary.set(summary);
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      present: 'badge-success', absent: 'badge-danger',
      leave: 'badge-warning', 'half-day': 'badge-info',
      holiday: 'badge-secondary', weekend: 'badge-secondary'
    };
    return map[status] ?? 'badge-secondary';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }
}
