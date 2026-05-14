import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerformanceService } from '../../core/services/performance.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { MonthlySummary, UserProfile } from '../../core/models/user.model';

@Component({
  selector: 'app-performance-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './performance-metrics.html',
  styleUrl: './performance-metrics.scss'
})
export class PerformanceMetricsComponent implements OnInit {
  private perfSvc = inject(PerformanceService);
  private auth = inject(AuthService);
  private userSvc = inject(UserService);

  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  
  selectedUser: string | null = null;
  selectedDepartment = 'All';
  
  users = signal<UserProfile[]>([]);
  departments = signal<string[]>(['All']);
  
  summary = signal<MonthlySummary | null>(null);
  trendData = signal<{ month: string, rate: number, isActive: boolean }[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  isAdmin() {
    return this.auth.isAdmin();
  }

  years = [2024, 2025, 2026];
  months = [
    { v: 1, n: 'January' }, { v: 2, n: 'February' }, { v: 3, n: 'March' },
    { v: 4, n: 'April' }, { v: 5, n: 'May' }, { v: 6, n: 'June' },
    { v: 7, n: 'July' }, { v: 8, n: 'August' }, { v: 9, n: 'September' },
    { v: 10, n: 'October' }, { v: 11, n: 'November' }, { v: 12, n: 'December' }
  ];

  async ngOnInit() {
    this.isLoading.set(true);
    try {
      const user = this.auth.currentUser();
      if (user) {
        this.selectedUser = user.uid;
      }

      if (this.isAdmin()) {
        await this.loadUsers();
      }
      
      if (this.selectedUser) {
        await this.loadMetrics();
      } else {
        this.isLoading.set(false);
      }
    } catch (e: any) {
      this.error.set(e.message || 'Failed to initialize analytics');
      this.isLoading.set(false);
    }
  }

  async loadUsers() {
    const all = await this.userSvc.getAllUsers();
    this.users.set(all);
    const deps = new Set(all.map(u => u.department).filter(Boolean) as string[]);
    this.departments.set(['All', ...Array.from(deps)]);
  }

  get filteredUsers() {
    const dept = this.selectedDepartment;
    if (dept === 'All') return this.users();
    return this.users().filter(u => u.department === dept);
  }

  async loadMetrics() {
    const uid = this.selectedUser;
    if (!uid) return;
    
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const [sum, trend] = await Promise.all([
        this.perfSvc.getPerformanceData(uid, this.currentYear, this.currentMonth),
        this.perfSvc.getYearlyTrend(uid, this.currentYear)
      ]);
      
      this.summary.set(sum);
      
      if (trend && Array.isArray(trend)) {
        this.trendData.set(trend.map((s, i) => ({
          month: this.months[i]?.n.substring(0, 3) || '???',
          rate: s?.attendancePercentage || 0,
          isActive: (i + 1) === this.currentMonth
        })));
      }
    } catch (e: any) {
      console.error('Performance Load Error:', e);
      this.error.set('Could not load performance data. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onUserChange() {
    this.loadMetrics();
  }

  onDepartmentChange() {
    // Reset selected user if they're not in the new department
    const usersInDept = this.filteredUsers;
    if (this.selectedUser && !usersInDept.find(u => u.uid === this.selectedUser)) {
      this.selectedUser = usersInDept[0]?.uid || null;
      this.loadMetrics();
    }
  }
}
