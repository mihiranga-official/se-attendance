import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
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
  
  // Import states
  selectedImportUid = signal('');
  isImporting = signal(false);
  importLog = signal<string[]>([]);
  showImportModal = signal(false);
  
  // Manual Entry states
  showManualModal = signal(false);
  manualData = signal({ uid: '', date: '', status: 'present', checkIn: '08:00', checkOut: '17:00', notes: '' });
  isSavingManual = signal(false);
  
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



  async onFileChange(event: any) {
    if (!this.selectedImportUid()) {
      alert('Please select a user first.');
      return;
    }

    const file = event.target.files[0];
    if (!file) return;

    this.isImporting.set(true);
    this.importLog.set(['Reading file...']);

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const bstr: string = e.target.result;
        const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary' });
        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];
        // Read only the necessary range (A1:E36 covers row 0 to 35 and columns A to E)
        const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, blankrows: false });

        // Limit data to the first 36 rows regardless of what's in the file
        const filteredData = data.slice(0, 36);
        
        this.importLog.update(log => [...log, `Found ${filteredData.length} active rows. Processing...`]);
        await this.processImportData(filteredData);
      } catch (err) {
        console.error(err);
        this.importLog.update(log => [...log, 'Error reading file.']);
      } finally {
        this.isImporting.set(false);
      }
    };
    reader.readAsBinaryString(file);
  }

  async processImportData(rows: any[]) {
    const uid = this.selectedImportUid();
    let successCount = 0;

    // Limit to rows 2 to 35 (first 35 rows) as requested
    const limit = Math.min(rows.length, 36); // 36 because i starts at 2 and we want up to row 35
    for (let i = 2; i < limit; i++) {
      const row = rows[i];
      if (!row[0]) continue; // Empty date

      try {
        const dateStr = this.parseExcelDate(row[0]);
        if (!dateStr) continue;

        const remark = row[3] || '';
        const inTimeRaw = String(row[1] || '').trim();
        
        let status: any = 'absent';
        let inTime: string | null = null;
        let outTime: string | null = null;

        if (inTimeRaw.toLowerCase().includes('holiday')) {
          status = 'holiday';
        } else if (inTimeRaw.toLowerCase().includes('leave')) {
          status = 'leave';
          // Create a leave record automatically
          await this.leaveSvc.applyLeave(uid, {
            date: dateStr,
            type: 'full',
            reason: 'Imported from Excel'
          });
        } else if (inTimeRaw.toLowerCase().includes('sunday')) {
          status = 'weekend';
        } else {
          inTime = this.parseExcelTime(row[1]);
          outTime = this.parseExcelTime(row[2]);
          if (inTime) {
            status = 'present';
          }
        }

        const record: any = {
          date: dateStr,
          checkIn: inTime || null,
          checkOut: outTime || null,
          notes: remark || null,
          status: status,
          workedHours: 0,
          otHours: 0
        };

        await this.attendSvc.saveAttendance(uid, record);
        successCount++;
      } catch (e: any) {
        this.importLog.update(log => [...log, `Row ${i+1} failed: ${e.message || 'Invalid data'}`]);
      }
    }

    this.importLog.update(log => [...log, `Successfully imported ${successCount} records.`]);
    await this.loadData();
  }

  async saveManualEntry() {
    const { uid, date, status, checkIn, checkOut, notes } = this.manualData();
    if (!uid || !date) {
      alert('Please select both user and date.');
      return;
    }

    this.isSavingManual.set(true);
    try {
      const record: any = {
        date,
        status,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        notes: notes || null,
        workedHours: 0,
        otHours: 0
      };

      await this.attendSvc.saveAttendance(uid, record);
      alert('Manual entry saved successfully.');
      this.showManualModal.set(false);
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to save manual entry.');
    } finally {
      this.isSavingManual.set(false);
    }
  }

  private parseExcelDate(val: any): string | null {
    try {
      if (!val) return null;
      
      // Handle Excel Serial Dates (numbers)
      if (typeof val === 'number') {
        const d = XLSX.SSF.parse_date_code(val);
        return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
      }

      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  private parseExcelTime(val: any): string | null {
    if (!val || val === 'Holiday') return null;
    try {
      // Handle Excel numeric times (fractions of a day)
      if (typeof val === 'number') {
        const sec = Math.round(val * 86400);
        const h = Math.floor(sec / 3600) % 24;
        const m = Math.floor(sec / 60) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }

      // If it's a date object from Excel
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      // If it's a string like "7:30:00 AM"
      const match = val.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)/i);
      if (match) {
        let h = parseInt(match[1]);
        const m = match[2];
        const ampm = match[4].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}`;
      }
      return null;
    } catch {
      return null;
    }
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
