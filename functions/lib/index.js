"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendManualReminder = exports.finalReminder = exports.midReminder = exports.morningReminder = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.database();
/**
 * Gets today's date in YYYY-MM-DD format based on Sri Lanka time zone (+5:30)
 * Adjust the timezone if necessary.
 */
function getTodayString() {
    const date = new Date();
    // Adjust to a specific timezone if needed, e.g., using toLocaleDateString
    // We'll use simple ISO string slice for local demonstration
    return date.toISOString().split("T")[0];
}
/**
 * Core logic to find pending users and send reminders
 */
async function sendAttendanceReminders(title, body) {
    const today = getTodayString();
    console.log(`[sendAttendanceReminders] Running for date: ${today}`);
    try {
        // 1. Fetch all users
        const usersSnap = await db.ref("users").once("value");
        if (!usersSnap.exists()) {
            console.log("No users found.");
            return;
        }
        const users = usersSnap.val();
        const activeEmployees = [];
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
        const todayAttendance = attendanceSnap.exists() ? attendanceSnap.val() : {};
        // 3. Filter employees who haven't marked attendance
        const pendingTokens = [];
        const pendingEmployees = [];
        for (const employee of activeEmployees) {
            const attendance = todayAttendance[employee.uid];
            // Check if they haven't checked in or status is not present/leave
            if (!attendance || !attendance.checkIn) {
                pendingTokens.push(employee.fcmToken);
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
            const failedTokens = [];
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
    }
    catch (error) {
        console.error("Error sending attendance reminders:", error);
    }
}
// Scheduled functions (Timezone defined as Asia/Colombo for example)
// 8:30 AM Morning Reminder
exports.morningReminder = functions.pubsub
    .schedule("30 8 * * *")
    .timeZone("Asia/Colombo")
    .onRun(async () => {
    await sendAttendanceReminders("Good Morning!", "Reminder: Please mark your attendance for today.");
});
// 12:00 PM Mid Reminder
exports.midReminder = functions.pubsub
    .schedule("0 12 * * *")
    .timeZone("Asia/Colombo")
    .onRun(async () => {
    await sendAttendanceReminders("Attendance Pending", "Attendance still pending. Please complete your attendance.");
});
// 5:00 PM Final Reminder
exports.finalReminder = functions.pubsub
    .schedule("0 17 * * *")
    .timeZone("Asia/Colombo")
    .onRun(async () => {
    await sendAttendanceReminders("Final Reminder", "Final reminder: Please mark your attendance before office closing.");
});
// Manual HTTP trigger for admin testing (Send Reminder Now)
exports.sendManualReminder = functions.https.onCall(async (data, context) => {
    // Add authentication check if necessary
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }
    const title = data.title || "Admin Reminder";
    const body = data.body || "Please check your attendance status.";
    await sendAttendanceReminders(title, body);
    return { success: true, message: "Manual reminder triggered." };
});
//# sourceMappingURL=index.js.map