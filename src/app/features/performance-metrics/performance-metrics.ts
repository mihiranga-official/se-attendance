import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PerformanceService } from '../../core/services/performance.service';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LeaveService } from '../../core/services/leave.service';
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
  private attendanceSvc = inject(AttendanceService);
  private leaveSvc = inject(LeaveService);

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

  // Detail lists for all 10 analytics cards
  lateArrivalsList = signal<any[]>([]);
  earlyLeavesList = signal<any[]>([]);
  halfDaysList = signal<any[]>([]);
  incompleteDaysList = signal<any[]>([]);
  overtimeList = signal<any[]>([]);
  twentyFourHourShiftsList = signal<any[]>([]);
  bonusEligibleList = signal<any[]>([]);
  bonusLostList = signal<any[]>([]);
  freeMealEligibleList = signal<any[]>([]);
  leaveCoverageList = signal<any[]>([]);

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

  formatDate(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }

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
      const [sum, trend, recent, leaves] = await Promise.all([
        this.perfSvc.getPerformanceData(uid, this.currentYear, this.currentMonth),
        this.perfSvc.getYearlyTrend(uid, this.currentYear),
        this.attendanceSvc.getAttendanceForMonth(uid, this.currentYear, this.currentMonth),
        this.leaveSvc.getLeavesForMonth(uid, this.currentYear, this.currentMonth)
      ]);
      
      this.summary.set(sum);
      
      if (trend && Array.isArray(trend)) {
        this.trendData.set(trend.map((s, i) => ({
          month: this.months[i]?.n.substring(0, 3) || '???',
          rate: s?.attendancePercentage || 0,
          isActive: (i + 1) === this.currentMonth
        })));
      }

      // Compute lists for hover views
      const sortedRecent = recent.sort((a, b) => a.date.localeCompare(b.date));

      // 1. Late Arrivals
      this.lateArrivalsList.set(
        sortedRecent.filter(r => r.isLate).map(r => ({
          date: r.date,
          info: `${r.lateMinutes || 0} mins late`
        }))
      );

      // 2. Early Leaves
      this.earlyLeavesList.set(
        sortedRecent.filter(r => r.actualStatus === 'Early Leave').map(r => ({
          date: r.date,
          info: `Worked: ${r.workedHours?.toFixed(1) || 0}h`
        }))
      );

      // 3. Half Days
      this.halfDaysList.set(
        sortedRecent.filter(r => r.actualStatus === 'Half Day' || r.status === 'half-day').map(r => ({
          date: r.date,
          info: `Worked: ${r.workedHours?.toFixed(1) || 0}h`
        }))
      );

      // 4. Incomplete Days
      this.incompleteDaysList.set(
        sortedRecent.filter(r => r.actualStatus === 'Incomplete').map(r => ({
          date: r.date,
          info: r.checkOut ? `Checked out: ${r.checkOut}` : 'No checkout'
        }))
      );

      // 5. Overtime Hours
      this.overtimeList.set(
        sortedRecent.filter(r => r.otHours && r.otHours > 0).map(r => ({
          date: r.date,
          info: `OT: +${r.otHours?.toFixed(1)}h`
        }))
      );

      // 6. 24H Shift Count
      this.twentyFourHourShiftsList.set(
        sortedRecent.filter(r => r.shiftType === '24h' || r.is24HourShift).map(r => ({
          date: r.date,
          info: '24 Hour Shift'
        }))
      );

      // 7. Bonus Eligible Days
      const coveredDays = new Set<string>();
      sortedRecent.forEach(r => {
        if (r.is24HourShift && r.checkInDate && r.checkOutDate && r.checkInDate !== r.checkOutDate) {
          coveredDays.add(r.checkOutDate);
        }
      });

      this.bonusEligibleList.set(
        sortedRecent
          .map(r => {
            const bonuses = r.bonusDaysEarned ?? (r.lostBonus ? 0 : 1);
            const isPresent = r.status === 'present' || r.checkIn;
            return { r, bonuses, isPresent };
          })
          .filter(item => item.isPresent && !coveredDays.has(item.r.date) && item.bonuses > 0)
          .map(item => ({
            date: item.r.date,
            info: item.bonuses === 2 ? '+2 Bonus Days' : '+1 Bonus Day'
          }))
      );

      // 8. Bonus Lost Days
      this.bonusLostList.set(
        sortedRecent
          .map(r => {
            const is24hMulti = r.is24HourShift && r.checkInDate !== r.checkOutDate;
            const targetDays = is24hMulti ? 2 : 1;
            const bonuses = r.bonusDaysEarned ?? (r.lostBonus ? 0 : 1);
            const lost = targetDays - bonuses;
            const isPresent = r.status === 'present' || r.checkIn;
            return { r, lost, isPresent };
          })
          .filter(item => item.isPresent && !coveredDays.has(item.r.date) && item.lost > 0)
          .map(item => ({
            date: item.r.date,
            info: item.r.notes || (item.lost === 2 ? 'Lost 2 Bonus Days' : 'Lost 1 Bonus Day')
          }))
      );

      // 9. Free Meal Eligible Days
      this.freeMealEligibleList.set(
        sortedRecent.filter(r => r.breakfastEligible || r.nextDayLunchEligible).map(r => {
          const meals = [];
          if (r.breakfastEligible) meals.push('Breakfast');
          if (r.nextDayLunchEligible) meals.push('Next-day Lunch');
          return {
            date: r.date,
            info: meals.join(' & ')
          };
        })
      );

      // 10. Leave Coverage
      this.leaveCoverageList.set(
        leaves.filter(l => l.isCovered).map(l => ({
          date: l.date,
          info: `Covered: ${l.coveredByDate}`,
          reason: l.reason
        })).sort((a, b) => a.date.localeCompare(b.date))
      );
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
