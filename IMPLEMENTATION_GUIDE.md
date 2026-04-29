# Implementation Guide - Step-by-Step Instructions

## Quick Reference

### Files to Modify:
1. `src/app/core/firebase.config.ts` - Move credentials to env vars
2. `src/app/core/services/auth.service.ts` - Remove backdoor, add validation
3. `functions/src/index.ts` - Add admin checks and input validation
4. `database.rules.json` - Improve security rules
5. `src/app/core/services/bonus.service.ts` - Add tiered bonus logic
6. `src/app/features/dashboard/dashboard.ts` - Update UI for bonus tiers
7. `.env` - Create environment variables file

---

## Step 1: Configure Environment Variables (15 minutes)

### Step 1a: Create `.env` file in project root

```bash
# .env
NG_APP_FIREBASE_API_KEY=AIzaSyCejEoIMyc1eZ6sYa7oyB5c-CrlQJ6OQNI
NG_APP_FIREBASE_AUTH_DOMAIN=he-and-she-356f5.firebaseapp.com
NG_APP_FIREBASE_PROJECT_ID=he-and-she-356f5
NG_APP_FIREBASE_STORAGE_BUCKET=he-and-she-356f5.appspot.com
NG_APP_FIREBASE_MESSAGING_SENDER_ID=123456789000
NG_APP_FIREBASE_APP_ID=1:123456789000:web:abcd1234efgh5678
NG_APP_FIREBASE_DATABASE_URL=https://he-and-she-356f5-default-rtdb.firebaseio.com
```

### Step 1b: Update `.gitignore`

Add these lines:
```
.env
.env.local
.env.*.local
```

### Step 1c: Update `angular.json`

In the `projects.damro-attendance.architect.build.configurations.production.fileReplacements` add:
```json
{
  "replace": "src/environments/environment.ts",
  "with": "src/environments/environment.prod.ts"
}
```

---

## Step 2: Remove Hardcoded Master Login (10 minutes)

### File: `src/app/core/services/auth.service.ts`

**Find and DELETE lines 44-56** (the hardcoded login block):

```typescript
// ❌ DELETE THIS ENTIRE BLOCK:
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

**Replace login method with:**

```typescript
login(email: string, password: string) {
  const cleanEmail = email.toLowerCase().trim();

  // ✅ Use only Firebase authentication (no backdoor)
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

// Add password validation method
validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Minimum 12 characters required');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Must include uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Must include lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Must include number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Must include special character (!@#$%^&*)');
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Step 3: Update Firebase Configuration (5 minutes)

### File: `src/app/core/firebase.config.ts`

**Replace entire file with:**

```typescript
import { FirebaseOptions } from '@angular/fire/app';

export const firebaseConfig: FirebaseOptions = {
  // Use environment variables instead of hardcoded values
  apiKey: import.meta.env.NG_APP_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.NG_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.NG_APP_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.NG_APP_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.NG_APP_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.NG_APP_FIREBASE_APP_ID || '',
  databaseURL: import.meta.env.NG_APP_FIREBASE_DATABASE_URL || '',
};

// Validate configuration
if (!firebaseConfig.projectId) {
  console.error('Firebase configuration missing. Ensure .env file is loaded.');
}
```

---

## Step 4: Secure Cloud Functions (30 minutes)

### File: `functions/src/index.ts`

**Install required package:**
```bash
cd functions
npm install zod
```

**Replace the entire file with the secured version below:**

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

admin.initializeApp();

// ============= HELPER FUNCTIONS =============

/**
 * Verify user has admin role
 */
async function verifyAdminRole(uid: string): Promise<boolean> {
  try {
    const userRecord = await admin.auth().getUser(uid);
    return userRecord.customClaims?.role === 'admin' || false;
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return false;
  }
}

/**
 * Sanitize text for FCM (remove HTML/XSS attempts)
 */
function sanitizeForFCM(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>"']/g, '') // Remove dangerous characters
    .trim();
}

/**
 * Log unauthorized access attempts
 */
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

/**
 * Get remaining attempt count for rate limiting
 */
async function getRateLimitAttempts(key: string): Promise<number> {
  const snapshot = await admin.database().ref(`ratelimit/${key}`).get();
  return snapshot.val() || 0;
}

/**
 * Increment rate limit counter
 */
async function incrementRateLimit(key: string, maxSeconds: number): Promise<void> {
  const ref = admin.database().ref(`ratelimit/${key}`);
  const currentValue = await getRateLimitAttempts(key);
  
  await ref.set(currentValue + 1);
  // Auto-delete after max time
  setTimeout(() => ref.remove(), maxSeconds * 1000);
}

// ============= VALIDATION SCHEMAS =============

const ManualReminderSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  targetUserIds: z.array(z.string()).optional(),
});

const BroadcastNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  actionUrl: z.string().url().optional(),
});

type ManualReminderData = z.infer<typeof ManualReminderSchema>;
type BroadcastNotificationData = z.infer<typeof BroadcastNotificationSchema>;

// ============= SCHEDULED FUNCTIONS =============

/**
 * Morning reminder - 8:30 AM (Asia/Colombo timezone)
 */
export const morningReminder = functions
  .region('asia-south1')
  .pubsub.schedule('30 8 * * *')
  .timeZone('Asia/Colombo')
  .onRun(async () => {
    console.log('Morning reminder triggered at 8:30 AM');
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const attendanceRef = admin.database().ref('attendance');
      const snapshot = await attendanceRef.get();

      if (!snapshot.exists()) {
        console.log('No attendance records found');
        return;
      }

      const attendance = snapshot.val();
      const notificationPromises: Promise<void>[] = [];

      for (const [uid, userAttendance] of Object.entries(attendance)) {
        if (userAttendance[today]?.status !== 'pending') continue;

        const userRef = admin.database().ref(`users/${uid}`);
        const userSnapshot = await userRef.get();
        const fcmToken = userSnapshot.val()?.fcmToken;

        if (fcmToken) {
          notificationPromises.push(
            admin.messaging().send({
              notification: {
                title: 'Morning Reminder',
                body: 'Please check in to mark your attendance',
              },
              token: fcmToken,
              data: { action: 'checkIn' },
            }).catch(err => {
              console.error(`Failed to send notification to ${uid}:`, err);
            })
          );
        }
      }

      await Promise.all(notificationPromises);
      console.log(`Sent ${notificationPromises.length} morning reminders`);

      // Log notification event
      await admin.database().ref('logs/notifications').push({
        type: 'morning_reminder',
        count: notificationPromises.length,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error('Error in morningReminder:', error);
    }
  });

/**
 * Afternoon reminder - 12:00 PM (Asia/Colombo timezone)
 */
export const midReminder = functions
  .region('asia-south1')
  .pubsub.schedule('0 12 * * *')
  .timeZone('Asia/Colombo')
  .onRun(async () => {
    console.log('Afternoon reminder triggered at 12:00 PM');
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const attendanceRef = admin.database().ref('attendance');
      const snapshot = await attendanceRef.get();

      if (!snapshot.exists()) return;

      const attendance = snapshot.val();
      const notificationPromises: Promise<void>[] = [];

      for (const [uid, userAttendance] of Object.entries(attendance)) {
        if (userAttendance[today]?.status !== 'pending') continue;

        const userRef = admin.database().ref(`users/${uid}`);
        const userSnapshot = await userRef.get();
        const fcmToken = userSnapshot.val()?.fcmToken;

        if (fcmToken) {
          notificationPromises.push(
            admin.messaging().send({
              notification: {
                title: 'Afternoon Reminder',
                body: 'Lunch time! Don\'t forget to check in if you haven\'t already',
              },
              token: fcmToken,
              data: { action: 'checkIn' },
            }).catch(err => {
              console.error(`Failed to send notification to ${uid}:`, err);
            })
          );
        }
      }

      await Promise.all(notificationPromises);
      console.log(`Sent ${notificationPromises.length} afternoon reminders`);

      await admin.database().ref('logs/notifications').push({
        type: 'afternoon_reminder',
        count: notificationPromises.length,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error('Error in midReminder:', error);
    }
  });

/**
 * Evening reminder - 5:00 PM (Asia/Colombo timezone)
 */
export const finalReminder = functions
  .region('asia-south1')
  .pubsub.schedule('0 17 * * *')
  .timeZone('Asia/Colombo')
  .onRun(async () => {
    console.log('Evening reminder triggered at 5:00 PM');
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const attendanceRef = admin.database().ref('attendance');
      const snapshot = await attendanceRef.get();

      if (!snapshot.exists()) return;

      const attendance = snapshot.val();
      const notificationPromises: Promise<void>[] = [];

      for (const [uid, userAttendance] of Object.entries(attendance)) {
        if (userAttendance[today]?.status !== 'pending') continue;

        const userRef = admin.database().ref(`users/${uid}`);
        const userSnapshot = await userRef.get();
        const fcmToken = userSnapshot.val()?.fcmToken;

        if (fcmToken) {
          notificationPromises.push(
            admin.messaging().send({
              notification: {
                title: 'Evening Reminder',
                body: 'Work day ending soon! Don\'t forget to check out',
              },
              token: fcmToken,
              data: { action: 'checkOut' },
            }).catch(err => {
              console.error(`Failed to send notification to ${uid}:`, err);
            })
          );
        }
      }

      await Promise.all(notificationPromises);
      console.log(`Sent ${notificationPromises.length} evening reminders`);

      await admin.database().ref('logs/notifications').push({
        type: 'evening_reminder',
        count: notificationPromises.length,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });
    } catch (error) {
      console.error('Error in finalReminder:', error);
    }
  });

// ============= CALLABLE CLOUD FUNCTIONS =============

/**
 * Send manual reminder to specific users (Admin only)
 * ✅ SECURITY: Admin verification, input validation, sanitization
 */
export const sendManualReminder = functions.https.onCall(
  async (data: unknown, context) => {
    console.log('sendManualReminder called by:', context.auth?.uid);

    // ✅ Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // ✅ Admin role verification (CRITICAL!)
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendManualReminder',
        'Non-admin attempted to send reminder'
      );
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    // ✅ Rate limiting
    const rateLimitKey = `manual_reminder_${context.auth.uid}_${Math.floor(Date.now() / 3600000)}`;
    const attempts = await getRateLimitAttempts(rateLimitKey);
    if (attempts >= 10) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Rate limit exceeded: Max 10 reminders per hour'
      );
    }
    await incrementRateLimit(rateLimitKey, 3600);

    // ✅ Input validation
    let validData: ManualReminderData;
    try {
      validData = ManualReminderSchema.parse(data);
    } catch (error) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid input format');
    }

    // ✅ Sanitize input
    validData.title = sanitizeForFCM(validData.title);
    validData.body = sanitizeForFCM(validData.body);

    // ✅ Send reminders
    try {
      const userIds = validData.targetUserIds || [];
      const notificationPromises: Promise<void>[] = [];
      let successCount = 0;

      for (const uid of userIds) {
        const userRef = admin.database().ref(`users/${uid}`);
        const userSnapshot = await userRef.get();
        const fcmToken = userSnapshot.val()?.fcmToken;

        if (fcmToken) {
          notificationPromises.push(
            admin.messaging().send({
              notification: {
                title: validData.title,
                body: validData.body,
              },
              token: fcmToken,
              data: { action: 'manualReminder' },
            })
            .then(() => { successCount++; })
            .catch(err => {
              console.error(`Failed to send notification to ${uid}:`, err);
            })
          );
        }
      }

      await Promise.all(notificationPromises);

      // ✅ Log successful action
      await admin.database().ref('logs/admin_actions').push({
        adminUid: context.auth.uid,
        action: 'SEND_MANUAL_REMINDER',
        targetUserIds: userIds,
        title: validData.title.substring(0, 50),
        successCount,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });

      return { 
        success: true, 
        sentCount: successCount,
        message: `Reminder sent to ${successCount} users`
      };
    } catch (error) {
      console.error('Error sending manual reminder:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to send reminders'
      );
    }
  }
);

/**
 * Send broadcast notification to all users (Admin only)
 * ✅ SECURITY: Admin verification, input validation, rate limiting
 */
export const sendBroadcastNotification = functions.https.onCall(
  async (data: unknown, context) => {
    console.log('sendBroadcastNotification called by:', context.auth?.uid);

    // ✅ Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }

    // ✅ Admin role verification (CRITICAL!)
    const isAdmin = await verifyAdminRole(context.auth.uid);
    if (!isAdmin) {
      await logUnauthorizedAccess(
        context.auth.uid,
        'sendBroadcastNotification',
        'Non-admin attempted broadcast'
      );
      throw new functions.https.HttpsError(
        'permission-denied',
        'Admin access required'
      );
    }

    // ✅ Rate limiting
    const rateLimitKey = `broadcast_${context.auth.uid}_${Math.floor(Date.now() / 86400000)}`;
    const attempts = await getRateLimitAttempts(rateLimitKey);
    if (attempts >= 5) {
      throw new functions.https.HttpsError(
        'resource-exhausted',
        'Rate limit exceeded: Max 5 broadcasts per day'
      );
    }
    await incrementRateLimit(rateLimitKey, 86400);

    // ✅ Input validation
    let validData: BroadcastNotificationData;
    try {
      validData = BroadcastNotificationSchema.parse(data);
    } catch (error) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid input format');
    }

    // ✅ Sanitize input
    validData.title = sanitizeForFCM(validData.title);
    validData.body = sanitizeForFCM(validData.body);

    // ✅ Send to all users
    try {
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
              title: validData.title,
              body: validData.body,
            },
            token: user.fcmToken,
            data: { action: 'broadcast' },
          })
          .then(() => { successCount++; })
          .catch(err => {
            console.error(`Failed to send notification to ${uid}:`, err);
          })
        );
      }

      await Promise.all(notificationPromises);

      // ✅ Log action
      await admin.database().ref('logs/admin_actions').push({
        adminUid: context.auth.uid,
        action: 'SEND_BROADCAST_NOTIFICATION',
        totalUsers,
        successCount,
        title: validData.title.substring(0, 50),
        timestamp: admin.database.ServerValue.TIMESTAMP,
      });

      return {
        success: true,
        sentCount: successCount,
        totalUsers,
        message: `Broadcast sent to ${successCount}/${totalUsers} users`
      };
    } catch (error) {
      console.error('Error sending broadcast:', error);
      throw new functions.https.HttpsError(
        'internal',
        'Failed to send broadcast'
      );
    }
  }
);
```

---

## Step 5: Update Firebase Security Rules (20 minutes)

### File: `database.rules.json`

**Replace entire file with:**

```json
{
  "rules": {
    // Users data - own profile or admin access
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

    // Attendance records - own records or admin access
    "attendance": {
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        
        "$date": {
          ".validate": "newData.hasChildren(['status']) && (newData.hasChildren(['checkIn']) || newData.hasChildren(['checkOut']) || newData.child('status').val() === 'leave' || newData.child('status').val() === 'holiday' || newData.child('status').val() === 'weekend')",
          
          "status": {
            ".validate": "newData.val() === 'present' || newData.val() === 'absent' || newData.val() === 'leave' || newData.val() === 'half-day' || newData.val() === 'holiday' || newData.val() === 'weekend' || newData.val() === 'pending'"
          }
        }
      }
    },

    // Leave records - own or admin
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

    // Settings - admin only (NO employee access)
    "settings": {
      ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".validate": "newData.hasChildren(['attendanceThreshold'])"
    },

    // Notifications - for logging
    "notifications": {
      ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },

    // Admin logs - admin only
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

    // Rate limiting
    "ratelimit": {
      ".read": "false",
      ".write": "true"
    }
  }
}
```

---

## Step 6: Set Up First Admin User

### Important: Do NOT create admin via code anymore!

**Use Firebase Console:**

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `he-and-she-356f5`
3. Go to Authentication → Users
4. Click "Add User" → Create a new admin user with strong password
5. Note the UID of the new admin user

**Set Admin Custom Claims (One-time setup):**

Run this command in your terminal (requires Firebase Admin SDK):

```bash
# First, create a one-time script
cat > set-admin-role.js << 'EOF'
const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json'); // Download from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

admin.auth().setCustomUserClaims('REPLACE_WITH_ADMIN_UID', { role: 'admin' })
  .then(() => {
    console.log('✅ Admin role successfully set');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error setting admin role:', error);
    process.exit(1);
  });
EOF

# Run it
node set-admin-role.js

# Then delete the file
rm set-admin-role.js
```

---

## Step 7: Migration: Create Tiered Bonus Logic (45 minutes)

Replace the contents of `src/app/core/services/bonus.service.ts` with the code from the main improvement plan (Part 5.2).

---

## Step 8: Update Dashboard UI (30 minutes)

Replace the contents of `src/app/features/dashboard/dashboard.ts` with the code from the main improvement plan (Part 5.3).

---

## Step 9: Testing & Validation

### 9a: Test Authentication

```typescript
// In your test or browser console
const auth = getAuth();

// Test 1: Login with valid credentials (should work)
signInWithEmailAndPassword(auth, 'validuser@company.com', 'ValidPassword123!')
  .then(() => console.log('✅ Login successful'))
  .catch(err => console.error('❌ Login failed:', err));

// Test 2: Try hardcoded credentials (should fail)
signInWithEmailAndPassword(auth, 'admin', 'admin')
  .then(() => console.log('❌ SECURITY ISSUE: Hardcoded login still works!'))
  .catch(err => console.log('✅ Hardcoded credentials blocked correctly'));

// Test 3: Try weak password (should fail in signup)
const validation = authService.validatePassword('weak');
console.log('Password validation:', validation);
```

### 9b: Test Cloud Functions

```typescript
// Test manual reminder with admin user
await firebase.functions().httpsCallable('sendManualReminder')({
  title: 'Test Reminder',
  body: 'This is a test',
  targetUserIds: ['uid1', 'uid2']
}).then(result => console.log('✅ Manual reminder sent:', result))
  .catch(err => console.error('❌ Error:', err));

// Test with non-admin user (should fail)
// Result: 'permission-denied' error
```

### 9c: Test Firebase Rules

```typescript
// In Firebase Realtime Database Console
// Try reading as employee: /settings
// Result: Should fail (no read access)

// Try reading as employee: /users/<other-uid>
// Result: Should fail (not your own data and not admin)

// Try reading as employee: /users/<your-uid>
// Result: Should succeed (own data)
```

### 9d: Test Bonus Calculation

```typescript
// Call bonus service
const bonusStatus = await bonusService.getUserBonusStatus(userUid);

// Check output includes:
// - presentDays: number
// - halfBonusEligible: boolean
// - fullBonusEligible: boolean
// - currentBonus: 'none' | 'half' | 'full'
// - daysUntilHalfBonus: number
// - daysUntilFullBonus: number
```

---

## Step 10: Deployment

### Pre-deployment Checklist

- [ ] All P0 fixes applied
- [ ] Environment variables configured
- [ ] Cloud Functions deployed with validation
- [ ] Firebase rules updated
- [ ] First admin user created via Firebase Console
- [ ] Testing completed
- [ ] Backup strategy in place

### Deployment Steps

```bash
# 1. Build the project
ng build --configuration production

# 2. Deploy Firebase functions
cd functions
npm run deploy

# 3. Deploy database rules
firebase deploy --only database

# 4. Deploy hosting (if using Firebase Hosting)
firebase deploy --only hosting

# 5. Verify deployment
firebase functions:list
firebase database:get /
```

---

## Maintenance Tasks

### Daily
- Monitor Firebase console for errors
- Check unauthorized access logs

### Weekly
- Review audit logs for admin actions
- Check failed login attempts

### Monthly
- Backup database
- Update security rules if needed
- Review and update dependencies

### Quarterly
- Security audit
- Performance review
- Update documentation

---

## Rollback Procedure

If something goes wrong:

```bash
# Revert Cloud Functions
firebase deploy --only functions --force

# Revert database rules
firebase deploy --only database --force

# Revert to previous Git commit if major issue
git revert <commit-hash>
```

---

**End of Implementation Guide**
