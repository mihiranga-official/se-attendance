# Quick Reference - Code Snippets for Direct Implementation

This file contains ready-to-use code snippets that can be directly applied to fix vulnerabilities.

---

## 1. Updated auth.service.ts - Login Method

**Location**: `src/app/core/services/auth.service.ts`

**Find this block (around line 44)** and DELETE it:
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

**Replace your login method with:**
```typescript
login(email: string, password: string) {
  const cleanEmail = email.toLowerCase().trim();

  return from(
    signInWithEmailAndPassword(this.auth, cleanEmail, password).then((result) => {
      this.authState$.next(true);
      return result;
    })
  ).pipe(
    catchError((error) => {
      this.handleAuthError(error);
      throw error;
    })
  );
}
```

**Add this password validation method:**
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
```

---

## 2. Update firebase.config.ts

**Replace entire file with:**
```typescript
import { FirebaseOptions } from '@angular/fire/app';

export const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.NG_APP_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.NG_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.NG_APP_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.NG_APP_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.NG_APP_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.NG_APP_FIREBASE_APP_ID || '',
  databaseURL: import.meta.env.NG_APP_FIREBASE_DATABASE_URL || '',
};

if (!firebaseConfig.projectId) {
  console.error('Firebase configuration missing. Ensure .env file is loaded.');
}
```

---

## 3. Create .env file in project root

```bash
NG_APP_FIREBASE_API_KEY=AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI
NG_APP_FIREBASE_AUTH_DOMAIN=he-and-she-356f5.firebaseapp.com
NG_APP_FIREBASE_PROJECT_ID=he-and-she-356f5
NG_APP_FIREBASE_STORAGE_BUCKET=he-and-she-356f5.appspot.com
NG_APP_FIREBASE_MESSAGING_SENDER_ID=123456789000
NG_APP_FIREBASE_APP_ID=1:123456789000:web:abcd1234efgh5678
NG_APP_FIREBASE_DATABASE_URL=https://he-and-she-356f5-default-rtdb.firebaseio.com
```

**Update .gitignore:**
```bash
.env
.env.local
.env.*.local
```

---

## 4. Cloud Functions - Admin Role Verification Helper

**Location**: `functions/src/index.ts` - Add at the top of file

```typescript
async function verifyAdminRole(uid: string): Promise<boolean> {
  try {
    const userRecord = await admin.auth().getUser(uid);
    return userRecord.customClaims?.role === 'admin' || false;
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return false;
  }
}

async function logUnauthorizedAccess(
  uid: string,
  operation: string,
  reason: string
): Promise<void> {
  try {
    await admin.database().ref('logs/unauthorized_access').push({
      uid,
      operation,
      reason,
      timestamp: admin.database.ServerValue.TIMESTAMP,
    });
  } catch (error) {
    console.error('Failed to log unauthorized access:', error);
  }
}

function sanitizeForFCM(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"']/g, '')
    .trim();
}
```

---

## 5. Updated sendManualReminder Function

**Replace in `functions/src/index.ts`:**

```typescript
export const sendManualReminder = functions.https.onCall(
  async (data: unknown, context) => {
    console.log('sendManualReminder called by:', context.auth?.uid);

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // ✅ VERIFY ADMIN ROLE
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendManualReminder',
        'Non-admin attempted to send reminder'
      );
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // ✅ INPUT VALIDATION
    const { title, body, targetUserIds } = data as any;
    
    if (!title || typeof title !== 'string' || title.length > 200) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid title');
    }
    if (!body || typeof body !== 'string' || body.length > 1000) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid body');
    }
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target users');
    }

    // ✅ SANITIZE INPUT
    const sanitizedTitle = sanitizeForFCM(title);
    const sanitizedBody = sanitizeForFCM(body);

    // Send reminders
    const notificationPromises: Promise<void>[] = [];
    let successCount = 0;

    for (const uid of targetUserIds) {
      const userRef = admin.database().ref(`users/${uid}`);
      const userSnapshot = await userRef.get();
      const fcmToken = userSnapshot.val()?.fcmToken;

      if (fcmToken) {
        notificationPromises.push(
          admin.messaging().send({
            notification: {
              title: sanitizedTitle,
              body: sanitizedBody,
            },
            token: fcmToken,
            data: { action: 'manualReminder' },
          })
          .then(() => { successCount++; })
          .catch(err => console.error(`Failed to send to ${uid}:`, err))
        );
      }
    }

    await Promise.all(notificationPromises);

    // ✅ LOG ACTION
    await admin.database().ref('logs/admin_actions').push({
      adminUid: context.auth.uid,
      action: 'SEND_MANUAL_REMINDER',
      targetUserIds,
      successCount,
      timestamp: admin.database.ServerValue.TIMESTAMP,
    });

    return { success: true, sentCount: successCount };
  }
);
```

---

## 6. Updated sendBroadcastNotification Function

**Replace in `functions/src/index.ts`:**

```typescript
export const sendBroadcastNotification = functions.https.onCall(
  async (data: unknown, context) => {
    console.log('sendBroadcastNotification called by:', context.auth?.uid);

    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    // ✅ VERIFY ADMIN ROLE
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendBroadcastNotification',
        'Non-admin attempted broadcast'
      );
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // ✅ INPUT VALIDATION
    const { title, body } = data as any;
    
    if (!title || typeof title !== 'string' || title.length > 200) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid title');
    }
    if (!body || typeof body !== 'string' || body.length > 1000) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid body');
    }

    // ✅ SANITIZE INPUT
    const sanitizedTitle = sanitizeForFCM(title);
    const sanitizedBody = sanitizeForFCM(body);

    // Get all users and send broadcast
    const usersRef = admin.database().ref('users');
    const usersSnapshot = await usersRef.get();

    if (!usersSnapshot.exists()) {
      return { success: true, sentCount: 0 };
    }

    const users = usersSnapshot.val();
    const notificationPromises: Promise<void>[] = [];
    let successCount = 0;
    const totalUsers = Object.keys(users).length;

    for (const [uid, user] of Object.entries(users)) {
      if (!user.fcmToken) continue;

      notificationPromises.push(
        admin.messaging().send({
          notification: {
            title: sanitizedTitle,
            body: sanitizedBody,
          },
          token: user.fcmToken,
          data: { action: 'broadcast' },
        })
        .then(() => { successCount++; })
        .catch(err => console.error(`Failed to send to ${uid}:`, err))
      );
    }

    await Promise.all(notificationPromises);

    // ✅ LOG ACTION
    await admin.database().ref('logs/admin_actions').push({
      adminUid: context.auth.uid,
      action: 'SEND_BROADCAST_NOTIFICATION',
      totalUsers,
      successCount,
      timestamp: admin.database.ServerValue.TIMESTAMP,
    });

    return { 
      success: true, 
      sentCount: successCount,
      totalUsers,
      message: `Broadcast sent to ${successCount}/${totalUsers} users`
    };
  }
);
```

---

## 7. Updated database.rules.json

**Replace entire file:**

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".validate": "newData.hasChildren(['uid', 'email', 'name', 'role'])",
        "role": {
          ".validate": "newData.val() === 'admin' || newData.val() === 'employee'"
        },
        "email": {
          ".validate": "newData.isString() && newData.val().contains('@')"
        }
      }
    },

    "attendance": {
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        "$date": {
          ".validate": "newData.hasChildren(['status'])",
          "status": {
            ".validate": "newData.val() === 'present' || newData.val() === 'absent' || newData.val() === 'leave' || newData.val() === 'half-day' || newData.val() === 'holiday' || newData.val() === 'weekend' || newData.val() === 'pending'"
          }
        }
      }
    },

    "leaves": {
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "(auth.uid === $uid && newData.child('status').val() === 'pending') || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        "$leaveId": {
          ".validate": "newData.hasChildren(['date', 'reason', 'status'])",
          "status": {
            ".validate": "newData.val() === 'pending' || newData.val() === 'approved' || newData.val() === 'rejected'"
          }
        }
      }
    },

    "settings": {
      ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".validate": "newData.hasChildren(['attendanceThreshold'])"
    },

    "notifications": {
      ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },

    "logs": {
      ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "false",
      "unauthorized_access": {
        ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "true"
      },
      "admin_actions": {
        ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "true"
      }
    },

    "ratelimit": {
      ".read": "false",
      ".write": "true"
    }
  }
}
```

---

## 8. Bonus Service Interface

**Add to `src/app/core/services/bonus.service.ts`:**

```typescript
export interface BonusRecord {
  uid: string;
  financialYear: string;
  presentDays: number;
  
  // Half Bonus (200 days)
  halfBonusThreshold: number;
  halfBonusEligible: boolean;
  daysUntilHalfBonus: number;
  
  // Full Bonus (240 days)
  fullBonusThreshold: number;
  fullBonusEligible: boolean;
  daysUntilFullBonus: number;
  
  // Status
  currentBonus: 'none' | 'half' | 'full';
  
  // Timeline
  startDate: string;
  endDate: string;
  updatedAt: string;
}
```

---

## 9. Bonus Calculation Logic (Key Methods)

**Add to BonusService class:**

```typescript
async getUserBonusStatus(uid: string, year?: string): Promise<BonusRecord> {
  const financialYear = year || this.getCurrentFinancialYear();
  const { startDate, endDate } = this.getFinancialYearDates(financialYear);

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

  const halfBonusEligible = presentDays >= 200;
  const fullBonusEligible = presentDays >= 240;

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
    halfBonusThreshold: 200,
    halfBonusEligible,
    daysUntilHalfBonus: Math.max(0, 200 - presentDays),
    fullBonusThreshold: 240,
    fullBonusEligible,
    daysUntilFullBonus: Math.max(0, 240 - presentDays),
    currentBonus,
    startDate,
    endDate,
    updatedAt: new Date().toISOString(),
  };
}

private getCurrentFinancialYear(): string {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();

  if (month < 3) {
    return `${year - 1}-${year}`;
  } else {
    return `${year}-${year + 1}`;
  }
}

private getFinancialYearDates(year: string): { startDate: string; endDate: string } {
  const [startYear] = year.split('-').map(Number);
  const startDate = new Date(startYear, 3, 1);
  const endDate = new Date(startYear + 1, 2, 31);

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

private parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}
```

---

## 10. Test Commands

### Test 1: Verify Hardcoded Login Removed
```typescript
// In browser console, try:
signInWithEmailAndPassword(auth, 'admin', 'admin')
  .then(() => console.log('❌ SECURITY ISSUE!'))
  .catch(() => console.log('✅ Hardcoded login blocked'));
```

### Test 2: Verify Cloud Function Auth
```typescript
// Try calling as non-admin
const functions = getFunctions();
const sendReminder = httpsCallable(functions, 'sendManualReminder');

sendReminder({ 
  title: 'Test', 
  body: 'Test', 
  targetUserIds: ['uid'] 
}).catch(err => console.log(err.code)); // Should be 'permission-denied'
```

### Test 3: Verify Firebase Rules
```typescript
// Try reading settings as employee (should fail):
const db = getDatabase();
const ref = database.ref('settings');
ref.get().catch(err => console.log('✅ Access denied'));
```

---

**End of Quick Reference**
