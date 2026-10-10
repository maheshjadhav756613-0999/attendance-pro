import cron from 'node-cron';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import { sendPushToRole } from '../services/pushService.js';
import { sendMonthlyReportToParent } from '../utils/parentNotificationTriggers.js';

// ============================================
// 📧 Monthly Email Job — दर महिन्याच्या 1 तारखेला सकाळी 9 ला
// ============================================
cron.schedule('0 9 1 * *', async () => {
  try {
    console.log('📧 Monthly report generation started...');

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const monthName = lastMonth.toLocaleDateString('en-IN', {
      month: 'long',
      year: 'numeric',
    });

    // सगळे students
    const students = await Student.find({ isActive: true })
      .populate('classId', 'name')
      .populate('schoolId', 'name');

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const student of students) {
      try {
        // Attendance data
        const attendance = await Attendance.find({
          studentId: student._id,
          date: { $gte: lastMonth, $lte: lastMonthEnd },
        });

        if (attendance.length === 0) continue;

        const total = attendance.length;
        const present = attendance.filter(
          (a) => a.status === 'Present' || a.status === 'Late'
        ).length;
        const percentage = ((present / total) * 100).toFixed(1);
        const monthKey = `${lastMonth.getFullYear()}-${String(
          lastMonth.getMonth() + 1
        ).padStart(2, '0')}`;
        await sendMonthlyReportToParent(student._id, monthKey);

        // जर parent email असेल तर पाठव
        if (student.parentEmail || student.email) {
          // TODO: Email service integrate करा
          // await sendMonthlyEmail({
          //   to: student.parentEmail || student.email,
          //   studentName: student.name,
          //   className: student.classId?.name,
          //   divisionName: student.divisionName,
          //   month: monthName,
          //   total,
          //   present,
          //   absent: total - present,
          //   percentage,
          //   subjectWise: [],
          // });

          emailsSent++;
        }
      } catch (err) {
        console.error(`Email failed for ${student.name}:`, err.message);
        emailsFailed++;
      }
    }

    console.log(
      `✅ Monthly emails sent: ${emailsSent}, failed: ${emailsFailed}`
    );

    // Admin ला notification
    await sendPushToRole('admin', {
      title: '📧 Monthly Reports Sent',
      body: `या महिन्याचे ${emailsSent} parents ला reports पाठवले`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'monthly-email-done',
      data: { url: '/admin/reports' },
    });
  } catch (error) {
    console.error('🔥 Monthly email job error:', error);
  }
});

console.log('📧 Monthly email job initialized (1st of every month, 9 AM)');