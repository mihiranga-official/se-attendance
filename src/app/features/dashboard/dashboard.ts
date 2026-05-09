import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { SummaryService } from '../../core/services/summary.service';
import { BonusService } from '../../core/services/bonus.service';
import { CelebrationService } from '../../core/services/celebration.service';
import { AttendanceRecord, MonthlySummary } from '../../core/models/user.model';
import { BonusCardComponent, BonusProgress } from '../../shared/components/bonus-card/bonus-card';
import { AttendanceStatusCardComponent } from '../../shared/components/attendance-status-card/attendance-status-card';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, BonusCardComponent, AttendanceStatusCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {
  auth = inject(AuthService);
  private attendanceSvc = inject(AttendanceService);
  private summarySvc = inject(SummaryService);
  private bonusSvc = inject(BonusService);
  private celebrationSvc = inject(CelebrationService);

  today = new Date();
  todayStr = this.attendanceSvc.getTodayStr();
  currentTime = signal(this.attendanceSvc.getCurrentTimeStr());

  todayRecord = signal<AttendanceRecord | null>(null);
  monthlySummary = signal<MonthlySummary | null>(null);
  bonusProgress = signal<BonusProgress | null>(null);
  recentRecords = signal<AttendanceRecord[]>([]);

  isCheckingIn = signal(false);
  isCheckingOut = signal(false);
  isLoadingBonus = signal(false);
  isEditing = signal(false);
  editCheckIn = '';
  editCheckOut = '';
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

    this.isLoadingBonus.set(true);
    const [rec, summary, recent, bonus] = await Promise.all([
      this.attendanceSvc.getAttendanceForDate(uid, this.todayStr),
      this.summarySvc.getMonthlySummary(uid, this.today.getFullYear(), this.today.getMonth() + 1),
      this.attendanceSvc.getAttendanceForMonth(uid, this.today.getFullYear(), this.today.getMonth() + 1),
      this.bonusSvc.getBonusProgress(uid)
    ]);

    this.todayRecord.set(rec);
    this.monthlySummary.set(summary);
    this.bonusProgress.set(bonus);
    this.recentRecords.set(recent.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7));
    this.isLoadingBonus.set(false);

    // Check for milestone celebration
    this.checkBonusCelebration(bonus);
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
      await this.refreshSummary();
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
      const [rec, bonus] = await Promise.all([
        this.attendanceSvc.getAttendanceForDate(uid, this.todayStr),
        this.bonusSvc.getBonusProgress(uid)
      ]);
      this.todayRecord.set(rec);
      this.bonusProgress.set(bonus);
      this.actionMsg.set(`✓ Checked out at ${rec?.checkOut} | Worked: ${rec?.workedHours?.toFixed(2)}h | OT: ${rec?.otHours?.toFixed(2)}h`);
      await this.refreshSummary();

      // Check for celebration after checkout as it might have pushed them over the threshold
      this.checkBonusCelebration(bonus);
    } catch (e: any) {
      this.actionError.set(e.message);
    } finally {
      this.isCheckingOut.set(false);
    }
  }

  toggleEdit() {
    if (this.isEditing()) {
      this.isEditing.set(false);
    } else {
      this.editCheckIn = this.todayRecord()?.checkIn || '';
      this.editCheckOut = this.todayRecord()?.checkOut || '';
      this.isEditing.set(true);
    }
  }

  async saveEdit() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    this.isEditing.set(false);
    this.isLoadingBonus.set(true);
    this.actionError.set('');
    this.actionMsg.set('');

    try {
      const changes: any = {};
      if (this.editCheckIn) changes.checkIn = this.editCheckIn;
      if (this.editCheckOut) changes.checkOut = this.editCheckOut;
      
      await this.attendanceSvc.updateAttendance(uid, this.todayStr, changes);
      
      const [rec, bonus] = await Promise.all([
        this.attendanceSvc.getAttendanceForDate(uid, this.todayStr),
        this.bonusSvc.getBonusProgress(uid)
      ]);
      
      this.todayRecord.set(rec);
      this.bonusProgress.set(bonus);
      await this.refreshSummary();
      this.actionMsg.set('✓ Times updated successfully');
    } catch (e: any) {
      this.actionError.set(e.message);
    } finally {
      this.isLoadingBonus.set(false);
    }
  }

  private checkBonusCelebration(bonus: BonusProgress | null) {
    if (!bonus) return;
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    const currentYear = new Date().getFullYear();
    const storageKey = `celebration_shown_${uid}_${currentYear}`;
    const shown = JSON.parse(localStorage.getItem(storageKey) || '{"half": false, "full": false}');

    if (bonus.fullBonusEligible && !shown.full) {
      this.celebrationSvc.showCelebration('full');
      shown.full = true;
      shown.half = true; // Also mark half as shown if they somehow jump straight to full
      localStorage.setItem(storageKey, JSON.stringify(shown));
    } else if (bonus.halfBonusEligible && !shown.half) {
      this.celebrationSvc.showCelebration('half');
      shown.half = true;
      localStorage.setItem(storageKey, JSON.stringify(shown));
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
