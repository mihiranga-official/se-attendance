import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SummaryService } from '../../core/services/summary.service';
import { AuthService } from '../../core/services/auth.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { MonthlySummary, AttendanceRecord } from '../../core/models/user.model';

@Component({
  selector: 'app-summary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './summary.html',
  styleUrl: './summary.scss'
})
export class SummaryComponent implements OnInit {
  private summarySvc = inject(SummaryService);
  private auth = inject(AuthService);
  private attendSvc = inject(AttendanceService);

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  
  summary = signal<MonthlySummary | null>(null);
  yearlySummary = signal<MonthlySummary | null>(null);
  records = signal<AttendanceRecord[]>([]);
  isLoading = signal(false);
  viewMode = signal<'monthly' | 'yearly'>('monthly');

  years = [2024, 2025, 2026];
  months = [
    { v: 1, n: 'January' }, { v: 2, n: 'February' }, { v: 3, n: 'March' },
    { v: 4, n: 'April' }, { v: 5, n: 'May' }, { v: 6, n: 'June' },
    { v: 7, n: 'July' }, { v: 8, n: 'August' }, { v: 9, n: 'September' },
    { v: 10, n: 'October' }, { v: 11, n: 'November' }, { v: 12, n: 'December' }
  ];

  async ngOnInit() {
    await this.loadSummary();
  }

  async loadSummary() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    
    this.isLoading.set(true);
    try {
      if (this.viewMode() === 'monthly') {
        const [sum, recs] = await Promise.all([
          this.summarySvc.getMonthlySummary(uid, this.currentYear, this.currentMonth),
          this.attendSvc.getAttendanceForMonth(uid, this.currentYear, this.currentMonth)
        ]);
        this.summary.set(sum);
        this.records.set(recs.sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        const yearSum = await this.summarySvc.getYearlySummary(uid, this.currentYear);
        this.yearlySummary.set(yearSum);
        this.records.set([]); // Optional: fetch all records for the year, but might be too large. Let's leave empty or fetch them. For now empty to just show cards.
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  setViewMode(mode: 'monthly' | 'yearly') {
    this.viewMode.set(mode);
    this.loadSummary();
  }

  async exportCSV() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    this.isLoading.set(true);
    try {
      let recordsToExport = this.records();
      let filename = `attendance_summary_${this.currentYear}_${this.currentMonth}.csv`;

      if (this.viewMode() === 'yearly') {
        recordsToExport = await this.attendSvc.getAttendanceForYear(uid, this.currentYear);
        filename = `attendance_summary_full_year_${this.currentYear}.csv`;
      }

      this.summarySvc.exportToCSV(recordsToExport.sort((a, b) => a.date.localeCompare(b.date)), filename);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      this.isLoading.set(false);
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      present: 'badge-success',
      absent: 'badge-danger',
      leave: 'badge-warning',
      'half-day': 'badge-info'
    };
    return map[status] ?? 'badge-secondary';
  }
}
