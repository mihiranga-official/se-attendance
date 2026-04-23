import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LeaveService } from '../../core/services/leave.service';
import { AuthService } from '../../core/services/auth.service';
import { UserProfile, AttendanceRecord, LeaveRecord } from '../../core/models/user.model';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class AdminComponent implements OnInit {
  private userSvc = inject(UserService);
  private attendSvc = inject(AttendanceService);
  private leaveSvc = inject(LeaveService);
  private auth = inject(AuthService);

  activeTab: 'users' | 'attendance' | 'leaves' = 'users';
  users = signal<UserProfile[]>([]);
  allLeaves = signal<{ uid: string; leaves: LeaveRecord[]; userName: string }[]>([]);
  allAttendance = signal<{ uid: string; records: AttendanceRecord[]; userName: string }[]>([]);
  
  isLoading = signal(false);
  
  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      const users = await this.userSvc.getAllUsers();
      this.users.set(users);

      const [leavesData, attendanceData] = await Promise.all([
        this.leaveSvc.getAllLeaves(),
        this.attendSvc.getAllAttendanceForMonth(new Date().getFullYear(), new Date().getMonth() + 1)
      ]);

      const leavesList = [];
      for (const uid in leavesData) {
        const user = users.find(u => u.uid === uid);
        leavesList.push({
          uid,
          userName: user?.name ?? 'Unknown',
          leaves: leavesData[uid]
        });
      }
      this.allLeaves.set(leavesList);

      const attendList = [];
      for (const uid in attendanceData) {
        const user = users.find(u => u.uid === uid);
        attendList.push({
          uid,
          userName: user?.name ?? 'Unknown',
          records: attendanceData[uid]
        });
      }
      this.allAttendance.set(attendList);

    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateLeaveStatus(uid: string, leaveId: string, status: 'approved' | 'rejected') {
    const adminId = this.auth.currentUser()?.uid;
    if (!adminId) return;

    try {
      await this.leaveSvc.updateLeaveStatus(uid, leaveId, status, adminId);
      await this.loadData();
    } catch (e) {
      console.error(e);
    }
  }

  getPendingLeavesCount(): number {
    return this.allLeaves().reduce((acc, curr) => 
      acc + curr.leaves.filter(l => l.status === 'pending').length, 0
    );
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-danger',
      present: 'badge-success',
      absent: 'badge-danger'
    };
    return map[status] ?? 'badge-secondary';
  }
}
