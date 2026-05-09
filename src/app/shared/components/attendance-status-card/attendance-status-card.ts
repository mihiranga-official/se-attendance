import { Component, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AttendanceRecord, MonthlySummary } from '../../../core/models/user.model';

@Component({
  selector: 'app-attendance-status-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './attendance-status-card.html',
  styleUrl: './attendance-status-card.scss'
})
export class AttendanceStatusCardComponent {
  @Input() todayRecord: AttendanceRecord | null = null;
  @Input() monthlySummary: MonthlySummary | null = null;
  @Input() loading = false;

  get checkInTime() {
    return this.todayRecord?.checkIn || '--:--';
  }

  get isLate() {
    return this.todayRecord?.isLate || false;
  }

  get isSaturdayViolation() {
    return this.todayRecord?.isSaturdayViolation || false;
  }

  get fullDayEligible() {
    // If not checked in, we don't know yet, assume true until late or out.
    // But if they have lost it, return false.
    if (!this.todayRecord?.checkIn) return true;
    return !this.todayRecord?.lostFullDay;
  }

  get totalLateDays() {
    return this.monthlySummary?.lateDays || 0;
  }

  get totalLateHoursFormatted() {
    const mins = this.monthlySummary?.totalLateMinutes || 0;
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }

  get bonusLostDays() {
    return this.monthlySummary?.bonusLostDays || 0;
  }

  get saturdayViolationsTotal() {
    return this.monthlySummary?.saturdayViolations || 0;
  }

  get attendanceScore() {
    return this.monthlySummary?.attendancePercentage || 0;
  }
}
