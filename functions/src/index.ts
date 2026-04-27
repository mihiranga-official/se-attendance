import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.database();

/**
 * Interface definitions
 */
interface UserProfile {
  uid: string;
  name: string;
  role: string;
  fcmToken?: string;
}

interface AttendanceRecord {
  checkIn?: string;
  status?: string;
}

/**
 * Gets today's date in YYYY-MM-DD format based on Sri Lanka time zone (+5:30)
 * Adjust the timezone if necessary.
 */
function getTodayString(): string {
  const date = new Date();
  // Adjust to a specific timezone if needed, e.g., using toLocaleDateString
  // We'll use simple ISO string slice for local demonstration
  return date.toISOString().split("T")[0];
}

/**
 * Core logic to find pending users and send reminders
 */
async function sendAttendanceReminders(title: string, body: string): Promise<void> {
  const today = getTodayString();
  console.log(`[sendAttendanceReminders] Running for date: ${today}`);

  try {
    // 1. Fetch all users
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) {
      console.log("No users found.");
      return;
    }

    const users: Record<string, UserProfile> = usersSnap.val();
    const activeEmployees: UserProfile[] = [];

    for (const [uid, user] of Object.entries(users)) {
      if (user.role === "employee" && user.fcmToken) {
        user.uid = uid;
        activeEmployees.push(user);
      }
    }

    if (activeEmployees.length === 0) {
      console.log("No active employees with FCM tokens found.");
      return;
    }

    // 2. Fetch today's attendance
    const attendanceSnap = await db.ref(`attendance/${today}`).once("value");
    const todayAttendance: Record<string, AttendanceRecord> = attendanceSnap.exists() ? attendanceSnap.val() : {};

    // 3. Filter employees who haven't marked attendance
    const pendingTokens: string[] = [];
    const pendingEmployees: UserProfile[] = [];

    for (const employee of activeEmployees) {
      const attendance = todayAttendance[employee.uid];
      // Check if they haven't checked in or status is not present/leave
      if (!attendance || !attendance.checkIn) {
        pendingTokens.push(employee.fcmToken!);
        pendingEmployees.push(employee);
      }
    }

    console.log(`Total employees: ${activeEmployees.length}`);
    console.log(`Already marked: ${activeEmployees.length - pendingTokens.length}`);
    console.log(`Sending to: ${pendingTokens.length}`);

    if (pendingTokens.length === 0) {
      console.log("Everyone has marked attendance! No reminders to send.");
      return;
    }

    // 4. Send Notifications via FCM Multicast
    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: pendingTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`${response.successCount} messages were sent successfully`);
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(pendingTokens[idx]);
          console.error(`Failed to send to ${pendingTokens[idx]}:`, resp.error);
        }
      });
    }

    // 5. Log the notification
    const logRef = db.ref("notifications").push();
    await logRef.set({
      title,
      message: body,
      sentCount: response.successCount,
      failedCount: response.failureCount,
      sentAt: admin.database.ServerValue.TIMESTAMP,
      type: "attendance_reminder"
    });

  } catch (error) {
    console.error("Error sending attendance reminders:", error);
  }
}

// Scheduled functions (Timezone defined as Asia/Colombo for example)

// 8:30 AM Morning Reminder
export const morningReminder = functions.pubsub
  .schedule("30 8 * * *")
  .timeZone("Asia/Colombo")
  .onRun(async () => {
    await sendAttendanceReminders(
      "Good Morning!",
      "Reminder: Please mark your attendance for today."
    );
  });

// 12:00 PM Mid Reminder
export const midReminder = functions.pubsub
  .schedule("0 12 * * *")
  .timeZone("Asia/Colombo")
  .onRun(async () => {
    await sendAttendanceReminders(
      "Attendance Pending",
      "Attendance still pending. Please complete your attendance."
    );
  });

// 5:00 PM Final Reminder
export const finalReminder = functions.pubsub
  .schedule("0 17 * * *")
  .timeZone("Asia/Colombo")
  .onRun(async () => {
    await sendAttendanceReminders(
      "Final Reminder",
      "Final reminder: Please mark your attendance before office closing."
    );
  });

// Manual HTTP trigger for admin testing (Send Reminder Now)
export const sendManualReminder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }
  
  const title = data.title || "Admin Reminder";
  const body = data.body || "Please check your attendance status.";

  await sendAttendanceReminders(title, body);
  return { success: true, message: "Manual reminder triggered." };
});

// Broadcast notification to ALL active users (Ignore attendance)
export const sendBroadcastNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }
  
  const title = data.title || "Company Announcement";
  const body = data.body || "Please check the latest updates.";

  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) return { success: false, message: "No users found" };

    const users: Record<string, UserProfile> = usersSnap.val();
    const allTokens: string[] = [];

    for (const user of Object.values(users)) {
      if (user.fcmToken) {
        allTokens.push(user.fcmToken);
      }
    }

    if (allTokens.length === 0) return { success: false, message: "No users with FCM tokens" };

    const message = {
      notification: { title, body },
      tokens: allTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Log it
    await db.ref("notifications").push().set({
      title,
      message: body,
      sentCount: response.successCount,
      failedCount: response.failureCount,
      sentAt: admin.database.ServerValue.TIMESTAMP,
      type: "broadcast_message"
    });

    return { success: true, message: `Broadcast sent to ${response.successCount} users.` };
  } catch (error) {
    console.error("Broadcast error:", error);
    throw new functions.https.HttpsError("internal", "Failed to send broadcast");
  }
});
