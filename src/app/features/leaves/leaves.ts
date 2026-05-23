import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeaveService } from '../../core/services/leave.service';
import { AuthService } from '../../core/services/auth.service';
import { LeaveRecord } from '../../core/models/user.model';

@Component({
  selector: 'app-leaves',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leaves.html',
  styleUrl: './leaves.scss'
})
export class LeavesComponent implements OnInit {
  private leaveSvc = inject(LeaveService);
  private auth = inject(AuthService);

  leaves = signal<LeaveRecord[]>([]);
  isLoading = signal(false);
  showModal = signal(false);

  // Form fields
  leaveDate = '';
  leaveType: 'full' | 'half-morning' | 'half-afternoon' = 'full';
  leaveReason = '';
  isCovered = false;
  coveredByDate = '';
  isSaving = signal(false);
  errorMsg = signal('');

  async ngOnInit() {
    await this.loadLeaves();
  }

  async loadLeaves() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;
    this.isLoading.set(true);
    try {
      const data = await this.leaveSvc.getLeaves(uid);
      this.leaves.set(data);
    } catch (e) {
      console.error(e);
    } finally {
      this.isLoading.set(false);
    }
  }

  openModal() {
    this.leaveDate = new Date().toISOString().split('T')[0];
    this.leaveType = 'full';
    this.leaveReason = '';
    this.isCovered = false;
    this.coveredByDate = '';
    this.errorMsg.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  async submitLeave() {
    const uid = this.auth.currentUser()?.uid;
    if (!uid) return;

    if (!this.leaveDate || !this.leaveReason) {
      this.errorMsg.set('Please fill in all fields.');
      return;
    }

    this.isSaving.set(true);
    try {
      const leaveData: any = {
        date: this.leaveDate,
        type: this.leaveType,
        reason: this.leaveReason
      };
      if (this.isCovered) {
        leaveData.isCovered = true;
        leaveData.coveredByDate = this.coveredByDate || this.leaveDate;
      }
      await this.leaveSvc.applyLeave(uid, leaveData);
      await this.loadLeaves();
      this.closeModal();
    } catch (e: any) {
      this.errorMsg.set(e.message ?? 'Failed to apply for leave.');
    } finally {
      this.isSaving.set(false);
    }
  }

  async cancelLeave(leaveId: string) {
    const uid = this.auth.currentUser()?.uid;
    if (!uid || !confirm('Are you sure you want to cancel this leave request?')) return;

    try {
      await this.leaveSvc.deleteLeave(uid, leaveId);
      await this.loadLeaves();
    } catch (e) {
      console.error(e);
    }
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      approved: 'badge-success',
      rejected: 'badge-danger'
    };
    return map[status] ?? 'badge-secondary';
  }
}
