import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SummaryService } from '../../../core/services/summary.service';
import { AttendanceService } from '../../../core/services/attendance.service';
import { AuthService } from '../../../core/services/auth.service';
import { DateRangeSummary } from '../../../core/models/user.model';

@Component({
  selector: 'app-date-range-summary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './date-range-summary.html',
  styleUrl: './date-range-summary.scss'
})
export class DateRangeSummaryComponent implements OnInit, OnChanges {
  private summarySvc = inject(SummaryService);
  private attendanceSvc = inject(AttendanceService);
  private auth = inject(AuthService);

  @Input() uid?: string;
  @Input() userName?: string;
  @Input() title: string = 'Custom Date Range Attendance & Leave Totals';

  startDate: string = '';
  endDate: string = '';

  summary = signal<DateRangeSummary | null>(null);
  isLoading = signal(false);
  activePreset = signal<string>('month');

  ngOnInit(): void {
    this.applyPreset('month');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['uid']) {
      this.calculateSummary();
    }
  }

  applyPreset(preset: 'month' | 'last-month' | '30days' | 'fiscal-ytd' | '90days' | 'q1-2026'): void {
    this.activePreset.set(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    const pad = (n: number) => String(n).padStart(2, '0');
    const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'month') {
      const first = new Date(y, m, 1);
      this.startDate = toIso(first);
      this.endDate = toIso(now);
    } else if (preset === 'last-month') {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0);
      this.startDate = toIso(first);
      this.endDate = toIso(last);
    } else if (preset === '30days') {
      const start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      this.startDate = toIso(start);
      this.endDate = toIso(now);
    } else if (preset === 'fiscal-ytd') {
      // Fiscal year starts April 1st
      const startYear = now.getMonth() >= 3 ? y : y - 1;
      this.startDate = `${startYear}-04-01`;
      this.endDate = toIso(now);
    } else if (preset === 'q1-2026') {
      this.startDate = '2026-01-01';
      this.endDate = '2026-03-31';
    } else if (preset === '90days') {
      const start = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
      this.startDate = toIso(start);
      this.endDate = toIso(now);
    }

    this.calculateSummary();
  }

  onCustomDateChange(): void {
    this.activePreset.set('custom');
    if (this.startDate && this.endDate && this.startDate <= this.endDate) {
      this.calculateSummary();
    }
  }

  async calculateSummary(): Promise<void> {
    const targetUid = this.uid || this.auth.currentUser()?.uid;
    if (!targetUid || !this.startDate || !this.endDate) return;

    if (this.startDate > this.endDate) {
      return;
    }

    this.isLoading.set(true);
    try {
      const res = await this.summarySvc.getDateRangeSummary(targetUid, this.startDate, this.endDate);
      this.summary.set(res);
    } catch (err) {
      console.error('Failed to calculate date range summary:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async exportRangeCsv(): Promise<void> {
    const targetUid = this.uid || this.auth.currentUser()?.uid;
    if (!targetUid || !this.startDate || !this.endDate) return;

    const records = await this.attendanceSvc.getAttendanceForDateRange(targetUid, this.startDate, this.endDate);
    const name = this.userName || this.auth.userProfile()?.name || 'employee';
    const cleanName = name.replace(/\s+/g, '_').toLowerCase();
    this.summarySvc.exportToCSV(records, `attendance_${cleanName}_${this.startDate}_to_${this.endDate}.csv`);
  }

  formatDate(isoStr?: string): string {
    if (!isoStr) return '—';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
  }
}
