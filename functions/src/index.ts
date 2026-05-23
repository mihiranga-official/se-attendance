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
  console.log(`[sendAttendanceReminders] Running manual trigger for date: ${today}`);

  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) {
      console.log("No users found.");
      return;
    }

    const users = usersSnap.val();
    const activeEmployees: UserProfile[] = [];

    for (const [uid, user] of Object.entries(users)) {
      if (user && typeof user === "object" && (user as any).role === "employee" && (user as any).fcmToken) {
        const u = user as any;
        u.uid = uid;
        activeEmployees.push(u);
      }
    }

    if (activeEmployees.length === 0) {
      console.log("No active employees with FCM tokens found.");
      return;
    }

    const attendanceSnap = await db.ref("attendance").once("value");
    const allAttendance = attendanceSnap.exists() ? attendanceSnap.val() : {};

    const pendingTokens: string[] = [];

    for (const employee of activeEmployees) {
      const userAtt = allAttendance[employee.uid];
      const todayAtt = userAtt ? userAtt[today] : null;

      // Check if they haven't checked in
      if (!todayAtt || !todayAtt.checkIn) {
        pendingTokens.push(employee.fcmToken!);
      }
    }

    console.log(`Total employees: ${activeEmployees.length}`);
    console.log(`Sending to: ${pendingTokens.length}`);

    if (pendingTokens.length === 0) {
      console.log("Everyone has marked attendance! No reminders to send.");
      return;
    }

    const message = {
      notification: { title, body },
      tokens: pendingTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`${response.successCount} messages were sent successfully`);

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

async function sendMorningReminders(): Promise<void> {
  const today = getTodayString();
  console.log(`[sendMorningReminders] Running for date: ${today}`);

  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) return;
    const users = usersSnap.val();

    const activeEmployees: UserProfile[] = [];
    for (const [uid, user] of Object.entries(users)) {
      if (user && typeof user === "object" && (user as any).role === "employee" && (user as any).fcmToken) {
        const u = user as any;
        u.uid = uid;
        activeEmployees.push(u);
      }
    }

    if (activeEmployees.length === 0) return;

    const attendanceSnap = await db.ref("attendance").once("value");
    const allAttendance = attendanceSnap.exists() ? attendanceSnap.val() : {};

    const pendingTokens: string[] = [];

    for (const employee of activeEmployees) {
      const userAtt = allAttendance[employee.uid];
      const todayAtt = userAtt ? userAtt[today] : null;

      // If no check-in marked
      if (!todayAtt || !todayAtt.checkIn) {
        pendingTokens.push(employee.fcmToken!);
      }
    }

    if (pendingTokens.length === 0) {
      console.log("Everyone has checked in this morning. No reminders sent.");
      return;
    }

    const message = {
      notification: {
        title: "Good Morning!",
        body: "Reminder: Please mark your attendance for today."
      },
      tokens: pendingTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`Morning reminders sent: ${response.successCount}`);

    await db.ref("notifications").push().set({
      title: "Good Morning!",
      message: "Reminder: Please mark your attendance for today.",
      sentCount: response.successCount,
      failedCount: response.failureCount,
      sentAt: admin.database.ServerValue.TIMESTAMP,
      type: "attendance_reminder"
    });
  } catch (error) {
    console.error("Error in morning reminders:", error);
  }
}

async function sendEveningReminders(): Promise<void> {
  const today = getTodayString();
  console.log(`[sendEveningReminders] Running for date: ${today}`);

  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) return;
    const users = usersSnap.val();

    const activeEmployees: UserProfile[] = [];
    for (const [uid, user] of Object.entries(users)) {
      if (user && typeof user === "object" && (user as any).role === "employee" && (user as any).fcmToken) {
        const u = user as any;
        u.uid = uid;
        activeEmployees.push(u);
      }
    }

    if (activeEmployees.length === 0) return;

    const attendanceSnap = await db.ref("attendance").once("value");
    const allAttendance = attendanceSnap.exists() ? attendanceSnap.val() : {};

    const missingCheckoutTokens: string[] = [];
    const missingCheckInTokens: string[] = [];

    for (const employee of activeEmployees) {
      const userAtt = allAttendance[employee.uid];
      const todayAtt = userAtt ? userAtt[today] : null;

      if (todayAtt && todayAtt.checkIn && !todayAtt.checkOut) {
        // Checked in but check out is missing
        missingCheckoutTokens.push(employee.fcmToken!);
      } else if (!todayAtt || !todayAtt.checkIn) {
        // Not checked in at all
        missingCheckInTokens.push(employee.fcmToken!);
      }
    }

    if (missingCheckoutTokens.length > 0) {
      const message = {
        notification: {
          title: "Missing Checkout Alert",
          body: "Reminder: You checked in this morning but haven't checked out. Please log your checkout."
        },
        tokens: missingCheckoutTokens,
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Custom checkout warnings sent: ${response.successCount}`);

      await db.ref("notifications").push().set({
        title: "Missing Checkout Alert",
        message: "Reminder: You checked in this morning but haven't checked out. Please log your checkout.",
        sentCount: response.successCount,
        failedCount: response.failureCount,
        sentAt: admin.database.ServerValue.TIMESTAMP,
        type: "attendance_reminder"
      });
    }

    if (missingCheckInTokens.length > 0) {
      const message = {
        notification: {
          title: "Final Attendance Reminder",
          body: "Final reminder: Please mark your attendance before office closing."
        },
        tokens: missingCheckInTokens,
      };
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Final check-in reminders sent: ${response.successCount}`);

      await db.ref("notifications").push().set({
        title: "Final Attendance Reminder",
        message: "Final reminder: Please mark your attendance before office closing.",
        sentCount: response.successCount,
        failedCount: response.failureCount,
        sentAt: admin.database.ServerValue.TIMESTAMP,
        type: "attendance_reminder"
      });
    }
  } catch (error) {
    console.error("Error in evening reminders:", error);
  }
}

// 8:30 AM Morning Reminder
export const morningReminder = functions.pubsub
  .schedule("30 8 * * *")
  .timeZone("Asia/Colombo")
  .onRun(async () => {
    await sendMorningReminders();
  });

// 5:00 PM Final Reminder (now Evening Reminder with missing checkout checks)
export const finalReminder = functions.pubsub
  .schedule("0 17 * * *")
  .timeZone("Asia/Colombo")
  .onRun(async () => {
    await sendEveningReminders();
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

    const users = usersSnap.val();
    const allTokens: string[] = [];

    for (const user of Object.values(users)) {
      if (user && typeof user === "object" && (user as any).fcmToken) {
        allTokens.push((user as any).fcmToken);
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
