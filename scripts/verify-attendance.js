const fs = require('fs');
const path = require('path');

// Utility to parse HH:mm to minutes
function toMinutes(time) {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

// Ensure accurate float math
function toHours(minutes) {
    return parseFloat((minutes / 60).toFixed(2));
}

function verifyAttendance(jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) {
        console.error(`File not found: ${jsonFilePath}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
    let attendanceData = data;
    
    // If the JSON is a full Firebase export, the attendance records might be nested under 'attendance'
    if (data.attendance) {
        attendanceData = data.attendance;
    }

    let totalChecked = 0;
    let discrepancies = 0;

    console.log(`Starting verification...`);

    // Loop through users
    for (const uid in attendanceData) {
        const userRecords = attendanceData[uid];
        
        // Loop through dates
        for (const date in userRecords) {
            const record = userRecords[date];
            
            // Skip incomplete records
            if (!record.checkIn || !record.checkOut) continue;

            const checkInDate = record.checkInDate || record.date;
            const checkOutDate = record.checkOutDate || record.date;
            
            const startDt = new Date(`${checkInDate}T${record.checkIn}`);
            const endDt = new Date(`${checkOutDate}T${record.checkOut}`);
            
            let totalWorkedMins = Math.floor((endDt.getTime() - startDt.getTime()) / (1000 * 60));
            if (totalWorkedMins < 0) totalWorkedMins = 0;

            let breaks = 0;
            if (record.is24HourShift) {
                breaks = 120; // 2 hours deducted for 24h shift breaks
                totalWorkedMins = Math.max(0, totalWorkedMins - breaks);
            }

            const expectedWorkedHours = toHours(totalWorkedMins);
            const actualWorkedHours = record.workedHours || 0;

            if (Math.abs(expectedWorkedHours - actualWorkedHours) > 0.05) {
                discrepancies++;
                console.log(`❌ Discrepancy found [UID: ${uid}, Date: ${date}]`);
                console.log(`   CheckIn: ${record.checkIn}, CheckOut: ${record.checkOut}`);
                console.log(`   Breaks Deducted: ${breaks} mins`);
                console.log(`   Calculated: ${expectedWorkedHours}h | Recorded: ${actualWorkedHours}h`);
            }
            
            totalChecked++;
        }
    }

    console.log(`\nVerification Complete!`);
    console.log(`Total Records Checked: ${totalChecked}`);
    if (discrepancies === 0) {
        console.log(`✅ All records mathematically reconciled successfully.`);
    } else {
        console.log(`⚠️ Found ${discrepancies} discrepancies.`);
    }
}

const args = process.argv.slice(2);
const filePath = args[0] || path.join(__dirname, '..', 'db_export.json');
verifyAttendance(filePath);
