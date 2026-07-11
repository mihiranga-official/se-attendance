import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';
import { ref, get, onValue, query, orderByChild, limitToLast, update, push, set, remove } from 'firebase/database';
import { database, functions } from '../../core/firebase.config';
import { httpsCallable } from 'firebase/functions';
import { UserService } from '../../core/services/user.service';
import { AttendanceService } from '../../core/services/attendance.service';
import { LeaveService } from '../../core/services/leave.service';
import { BonusService } from '../../core/services/bonus.service';
import { HolidayService } from '../../core/services/holiday.service';
import { AuthService } from '../../core/services/auth.service';
import { CustomDialogService } from '../../core/services/custom-dialog.service';
import { NotificationService } from '../../core/services/notification.service';
import { UserProfile, AttendanceRecord, LeaveRecord } from '../../core/models/user.model';
import { BonusProgress } from '../../shared/components/bonus-card/bonus-card';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  private userSvc = inject(UserService);
  private attendSvc = inject(AttendanceService);
  private leaveSvc = inject(LeaveService);
  private bonusSvc = inject(BonusService);
  private auth = inject(AuthService);
  readonly holidaySvc = inject(HolidayService);
  private dialogSvc = inject(CustomDialogService);
  private notificationSvc = inject(NotificationService);
  private usersUnsubscribe?: () => void;
  private eventsUnsubscribe?: () => void;

  // Holiday management state
  newHolidayDate = '';
  newHolidayName = '';
  isSavingHoliday = signal(false);
  holidaySaveMsg = signal('');

  // Special Events management state
  specialEvents = signal<any[]>([]);
  newEventDate = '';
  newEventTitle = '';
  newEventDesc = '';
  newEventTarget: 'all' | 'specific' = 'all';
  newEventTargetUid = '';
  isSavingEvent = signal(false);
  eventSaveMsg = signal('');

  activeTab: 'users' | 'attendance' | 'leaves' | 'notifications' | 'bonus' | 'holidays' | 'events' = 'users';
  showPermissionHelp = signal(false);
  users = signal<UserProfile[]>([]);
  allLeaves = signal<{ uid: string; leaves: LeaveRecord[]; userName: string }[]>([]);
  allAttendance = signal<{ uid: string; records: AttendanceRecord[]; userName: string }[]>([]);
  bonusSummary = signal<{ uid: string; userName: string; progress: BonusProgress }[]>([]);
  notifications = signal<any[]>([]);

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

  // Add User states
  showAddUserModal = signal(false);
  isSavingUser = signal(false);
  newUserData = { name: '', email: '', role: 'employee' as 'admin' | 'employee', uid: '', dob: '' };

  // Edit User states
  showEditUserModal = signal(false);
  isSavingEdit = signal(false);
  editingUserData = signal<Partial<UserProfile>>({});

  // User Import states
  showUserImportModal = signal(false);
  isImportingUsers = signal(false);
  userImportLog = signal<string[]>([]);

  async ngOnInit() {
    await this.loadData();
  }

  ngOnDestroy() {
    if (this.usersUnsubscribe) {
      this.usersUnsubscribe();
    }
    if (this.eventsUnsubscribe) {
      this.eventsUnsubscribe();
    }
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      // Unsubscribe from any previous listener
      if (this.usersUnsubscribe) {
        this.usersUnsubscribe();
      }
      if (this.eventsUnsubscribe) {
        this.eventsUnsubscribe();
      }

      // Real-time listener for special events
      const specialEventsRef = ref(database, 'specialEvents');
      this.eventsUnsubscribe = onValue(specialEventsRef, (snap) => {
        if (!snap.exists()) {
          this.specialEvents.set([]);
        } else {
          const raw = snap.val();
          const list = Object.entries(raw).map(([id, item]: [string, any]) => ({
            ...item,
            id
          }));
          list.sort((a, b) => b.date.localeCompare(a.date));
          this.specialEvents.set(list);
        }
      });

      // Real-time listener for users
      const usersRef = ref(database, 'users');
      this.usersUnsubscribe = onValue(usersRef, (snap) => {
        const data = snap.exists() ? snap.val() : {};
        // Safety check: handle both Object and Array formats from Firebase
        const usersList = (Array.isArray(data) ? data : Object.values(data))
          .filter(u => u && typeof u === 'object' && u.name) as UserProfile[];

        console.log('Admin: Users list updated:', usersList.length);
        this.processUsers(usersList);
      }, (err) => {
        console.error('Admin: Database error:', err);
        // If the user has logged out or is logging out, ignore permission errors gracefully
        if (!this.auth.currentUser() || this.auth.isLoggingOut) {
          return;
        }
        if (err.message.includes('permission_denied')) {
          this.showPermissionHelp.set(true);
          return;
        }
        alert('Database connection error: ' + err.message);
      });

      // One-time fetch for records
      const [leavesData, attendanceSnap, notificationsSnap] = await Promise.all([
        this.leaveSvc.getAllLeaves(),
        get(ref(database, 'attendance')),
        get(ref(database, 'notifications'))
      ]);

      this.processRecords(leavesData, attendanceSnap);

      if (notificationsSnap.exists()) {
        const notifs = Object.entries(notificationsSnap.val()).map(([id, data]: [string, any]) => ({ id, ...data }));
        this.notifications.set(notifs.sort((a, b) => b.sentAt - a.sentAt));
      }
    } catch (e: any) {
      console.error(e);
      alert('Error loading data: ' + e.message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async addHoliday() {
    if (!this.newHolidayDate || !this.newHolidayName.trim()) {
      this.holidaySaveMsg.set('Please provide both a date and a name.');
      return;
    }
    this.isSavingHoliday.set(true);
    try {
      await this.holidaySvc.setHoliday(this.newHolidayDate, this.newHolidayName.trim());
      this.holidaySaveMsg.set(`✅ "${this.newHolidayName}" added for ${this.newHolidayDate}`);
      this.newHolidayDate = '';
      this.newHolidayName = '';
      setTimeout(() => this.holidaySaveMsg.set(''), 3000);
    } catch(e: any) {
      this.holidaySaveMsg.set('Error: ' + e.message);
    } finally {
      this.isSavingHoliday.set(false);
    }
  }

  async deleteHoliday(date: string) {
    const isConfirmed = await this.dialogSvc.confirm('Remove Holiday', `Remove holiday on ${date}?`);
    if (!isConfirmed) return;
    await this.holidaySvc.removeHoliday(date);
  }

  private processUsers(users: UserProfile[]) {
    const currentAdminUid = this.auth.currentUser()?.uid;
    
    // Filter out duplicate admin accounts from the UI view
    const filteredUsers = users.filter(u => {
      if (u.role === 'admin') {
        if (currentAdminUid) {
          return u.uid === currentAdminUid;
        }
      }
      return true;
    });

    this.users.set(filteredUsers);

    // Automatically clean up duplicate admin accounts in the database
    if (currentAdminUid) {
      const duplicatesToDelete = users.filter(u => 
        u.role === 'admin' && 
        (u.email === 'admin@damro.local' || u.email === 'da@damro.local') && 
        u.uid !== currentAdminUid
      );

      if (duplicatesToDelete.length > 0) {
        console.log('Admin: Cleaning up duplicate admin accounts from database:', duplicatesToDelete.map(u => u.uid));
        const updates: Record<string, null> = {};
        duplicatesToDelete.forEach(u => {
          updates[`users/${u.uid}`] = null;
        });
        update(ref(database), updates)
          .then(() => console.log('Admin: Successfully cleaned up duplicate admins.'))
          .catch((err) => console.error('Admin: Failed to clean up duplicate admins:', err));
      }
    }
  }

  private processRecords(leavesData: any, attendanceSnap: any) {
    const attendanceDataRaw = attendanceSnap.exists() ? attendanceSnap.val() : {};
    const prefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const users = this.users();

    const attendanceData: Record<string, AttendanceRecord[]> = {};
    const bonusList: { uid: string; userName: string; progress: BonusProgress }[] = [];
    const discoveredUids = new Set<string>();

    for (const uid in attendanceDataRaw) {
      discoveredUids.add(uid);
      const userRecords = attendanceDataRaw[uid] as Record<string, AttendanceRecord>;
      attendanceData[uid] = Object.values(userRecords).filter(r => r.date.startsWith(prefix));
      
      const user = users.find(u => u.uid === uid);
      bonusList.push({
        uid,
        userName: user?.name ?? `User (${uid.slice(-4)})`,
        progress: this.bonusSvc.calculateBonusFromRecords(userRecords)
      });
    }

    for (const uid in leavesData) discoveredUids.add(uid);

    const attendList = [];
    for (const uid in attendanceData) {
      const user = users.find(u => u.uid === uid);
      attendList.push({
        uid,
        userName: user?.name ?? `User (${uid.slice(-4)})`,
        records: attendanceData[uid]
      });
    }
    this.allAttendance.set(attendList);
    this.bonusSummary.set(bonusList.sort((a, b) => b.progress.presentDays - a.progress.presentDays));

    const leavesList = [];
    for (const uid in leavesData) {
      const user = users.find(u => u.uid === uid);
      leavesList.push({
        uid,
        userName: user?.name ?? `User (${uid.slice(-4)})`,
        leaves: leavesData[uid]
      });
    }
    this.allLeaves.set(leavesList);

    // Discover missing users
    const missingUids = Array.from(discoveredUids).filter(uid => !users.find(u => u.uid === uid));
    if (missingUids.length > 0) {
      const placeholders = missingUids.map(uid => ({
        uid,
        name: `Discovered User (${uid.slice(-4)})`,
        email: 'placeholder@system.local',
        role: 'employee' as const,
        createdAt: new Date().toISOString()
      }));
      this.users.set([...users, ...placeholders]);
    }
  }



  async onFileChange(event: any) {
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

        // Use sheet_to_json to handle all columns automatically
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        this.importLog.update(log => [...log, `Found ${data.length} rows. Processing...`]);
        await this.processImportData(data);
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
    let targetUid = this.selectedImportUid();
    let successCount = 0;
    let newUsersCount = 0;

    for (const row of rows) {
      const dateVal = row['Date'] || row['date'];
      const nameVal = row['Name'] || row['name'];
      const inVal = row['In Time'] || row['in'] || row['Check In'];
      const outVal = row['Out Time'] || row['out'] || row['Check Out'];
      const remarkVal = row['Remark'] || row['notes'] || row['remark'];

      if (!dateVal) continue;

      let uid = targetUid;

      // Auto-match user by name if no specific user selected
      if (!uid && nameVal) {
        const existingUser = this.users().find(u => u.name.toLowerCase() === nameVal.toLowerCase());
        if (existingUser) {
          uid = existingUser.uid;
        } else {
          // AUTO-CREATE PROFILE
          const newUserUid = `user_auto_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const email = `${nameVal.toLowerCase().replace(/\s+/g, '.')}@company.com`;
          const profile: UserProfile = {
            uid: newUserUid,
            name: nameVal,
            email: email,
            role: 'employee',
            createdAt: new Date().toISOString()
          };
          await this.userSvc.createUserProfile(profile);
          uid = newUserUid;
          newUsersCount++;
          this.users.update(list => [...list, profile]);
        }
      }

      if (!uid) continue;

      try {
        const dateStr = this.parseExcelDate(dateVal);
        if (!dateStr) continue;

        const inTimeRaw = String(inVal || '').trim();
        let status: any = 'absent';
        let inTime: string | null = null;
        let outTime: string | null = null;

        if (inTimeRaw.toLowerCase().includes('holiday')) {
          status = 'holiday';
        } else if (inTimeRaw.toLowerCase().includes('leave')) {
          status = 'leave';
        } else if (inTimeRaw.toLowerCase().includes('sunday')) {
          status = 'weekend';
        } else {
          inTime = this.parseExcelTime(inVal);
          outTime = this.parseExcelTime(outVal);
          if (inTime) status = 'present';
        }

        const record: AttendanceRecord = {
          date: dateStr,
          checkIn: inTime || undefined,
          checkOut: outTime || undefined,
          notes: remarkVal || undefined,
          status: status,
          workedHours: 0,
          otHours: 0
        };

        await this.attendSvc.saveAttendance(uid, record);
        successCount++;
      } catch (e: any) {
        console.error(e);
      }
    }

    this.importLog.update(log => [
      ...log,
      `Import complete: ${successCount} records saved.`,
      newUsersCount > 0 ? `${newUsersCount} new users auto-created.` : ''
    ].filter(Boolean));
    await this.loadData();
  }

  async addNewUser() {
    const { name, email, role, uid, dob } = this.newUserData;
    if (!name || !email) {
      alert('Name and Email are required.');
      return;
    }

    this.isSavingUser.set(true);
    try {
      const newUserUid = uid || `user_${Date.now()}`;
      const profile: UserProfile = {
        uid: newUserUid,
        name,
        email,
        role,
        dob: dob || undefined,
        createdAt: new Date().toISOString()
      };

      await this.userSvc.createUserProfile(profile);
      alert('User profile created successfully.');
      this.showAddUserModal.set(false);
      this.newUserData = { name: '', email: '', role: 'employee', uid: '', dob: '' };
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to create user profile.');
    } finally {
      this.isSavingUser.set(false);
    }
  }

  editUser(user: UserProfile) {
    this.editingUserData.set({ ...user });
    this.showEditUserModal.set(true);
  }

  async saveUserEdit() {
    const editData = this.editingUserData();
    if (!editData.uid || !editData.name || !editData.email) {
      alert('Name and Email are required.');
      return;
    }
    this.isSavingEdit.set(true);
    try {
      await this.userSvc.updateUser(editData.uid, {
        name: editData.name,
        email: editData.email,
        role: editData.role,
        dob: editData.dob || undefined
      });
      alert('User profile updated successfully.');
      this.showEditUserModal.set(false);
      await this.loadData();
    } catch (e) {
      console.error(e);
      alert('Failed to update user profile.');
    } finally {
      this.isSavingEdit.set(false);
    }
  }

  async onUserFileChange(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.isImportingUsers.set(true);
    this.userImportLog.set(['Reading user list...']);

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const bstr: string = e.target.result;
        const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary' });
        const ws: XLSX.WorkSheet = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        this.userImportLog.update(log => [...log, `Found ${data.length} rows. Processing...`]);
        await this.processUserImport(data);
      } catch (err) {
        console.error(err);
        this.userImportLog.update(log => [...log, 'Error reading file.']);
      } finally {
        this.isImportingUsers.set(false);
      }
    };
    reader.readAsBinaryString(file);
  }

  async processUserImport(rows: any[]) {
    let successCount = 0;
    for (const row of rows) {
      const name = row['Name'] || row['name'];
      const email = row['Email'] || row['email'];
      const role = (row['Role'] || row['role'] || 'employee').toLowerCase() as 'admin' | 'employee';
      const uid = row['UID'] || row['uid'] || `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      if (!name || !email) continue;

      try {
        const profile: UserProfile = {
          uid,
          name,
          email,
          role: role === 'admin' ? 'admin' : 'employee',
          createdAt: new Date().toISOString()
        };
        await this.userSvc.createUserProfile(profile);
        successCount++;
      } catch (e) {
        console.error(e);
      }
    }
    this.userImportLog.update(log => [...log, `Successfully imported ${successCount} users.`]);
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
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        notes: notes || undefined,
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

  isSendingReminder = signal(false);

  async triggerManualReminder() {
    const isConfirmed = await this.dialogSvc.confirm('Send Reminder', 'Are you sure you want to send a manual reminder to all pending employees right now?');
    if (!isConfirmed) return;

    this.isSendingReminder.set(true);
    try {
      const sendReminder = httpsCallable(functions, 'sendManualReminder');
      const response: any = await sendReminder({
        title: 'Admin Reminder',
        body: 'Please check your attendance status. If you have not marked your attendance, please do so now.'
      });
      alert(response.data?.message || 'Reminder sent successfully.');
      await this.loadData();
    } catch (e: any) {
      console.error('Manual reminder error:', e);
      alert('Failed to send reminder. ' + e.message);
    } finally {
      this.isSendingReminder.set(false);
    }
  }

  async triggerBroadcastReminder() {
    const title = prompt('Enter notification title:', 'Company Announcement');
    if (!title) return;
    
    const body = prompt('Enter notification message:', 'Please check the latest updates.');
    if (!body) return;

    const isConfirmed = await this.dialogSvc.confirm('Broadcast Notification', 'Are you sure you want to broadcast this to ALL users?');
    if (!isConfirmed) return;
    
    this.isSendingReminder.set(true);
    try {
      const sendBroadcast = httpsCallable(functions, 'sendBroadcastNotification');
      const response: any = await sendBroadcast({ title, body });
      alert(response.data?.message || 'Broadcast sent successfully.');
      await this.loadData();
    } catch (e: any) {
      console.error('Broadcast reminder error:', e);
      alert('Failed to send broadcast. ' + e.message);
    } finally {
      this.isSendingReminder.set(false);
    }
  }

  getUserName(uid: string): string {
    const user = this.users().find(u => u.uid === uid);
    return user ? user.name : `User (${uid.slice(-4)})`;
  }

  async addSpecialEvent() {
    if (!this.newEventDate || !this.newEventTitle.trim()) {
      this.eventSaveMsg.set('Please provide both event date and title.');
      return;
    }
    if (this.newEventTarget === 'specific' && !this.newEventTargetUid) {
      this.eventSaveMsg.set('Please select a target employee.');
      return;
    }

    this.isSavingEvent.set(true);
    this.eventSaveMsg.set('');

    try {
      const eventRef = ref(database, 'specialEvents');
      const newEventRef = push(eventRef);
      const eventData = {
        date: this.newEventDate,
        title: this.newEventTitle.trim(),
        description: this.newEventDesc.trim(),
        target: this.newEventTarget,
        targetUid: this.newEventTarget === 'specific' ? this.newEventTargetUid : null,
        createdAt: new Date().toISOString()
      };

      await set(newEventRef, eventData);

      // Pushing in-app notifications to targeted users
      const notifTitle = `📅 New Event: ${eventData.title}`;
      const notifMsg = `${eventData.description || 'No description provided.'} (Scheduled for ${eventData.date})`;

      if (this.newEventTarget === 'all') {
        const activeUsers = this.users();
        const promises = activeUsers.map(u => 
          this.notificationSvc.sendNotification(u.uid, notifTitle, notifMsg, 'event')
        );
        await Promise.all(promises);
      } else {
        await this.notificationSvc.sendNotification(this.newEventTargetUid, notifTitle, notifMsg, 'event');
      }

      this.eventSaveMsg.set(`✅ Event "${eventData.title}" created successfully!`);
      this.newEventDate = '';
      this.newEventTitle = '';
      this.newEventDesc = '';
      this.newEventTarget = 'all';
      this.newEventTargetUid = '';
      setTimeout(() => this.eventSaveMsg.set(''), 3000);
    } catch (e: any) {
      console.error(e);
      if (e.message?.toLowerCase().includes('permission_denied') || e.message?.toLowerCase().includes('permission denied')) {
        this.showPermissionHelp.set(true);
      }
      this.eventSaveMsg.set('❌ Error: ' + e.message);
    } finally {
      this.isSavingEvent.set(false);
    }
  }

  async deleteSpecialEvent(id: string, title: string) {
    const isConfirmed = await this.dialogSvc.confirm('Remove Special Event', `Are you sure you want to remove "${title}"?`);
    if (!isConfirmed) return;

    try {
      await remove(ref(database, `specialEvents/${id}`));
      alert('Event removed successfully.');
    } catch (e: any) {
      alert('Failed to remove event: ' + e.message);
    }
  }
}
