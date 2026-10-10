import { sendPushToUser } from '../services/pushService.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import { getParentNotificationUserIds } from './studentNotificationRecipients.js';

// ============================================
// 🎯 TRIGGER 1: Child Daily Attendance
// ============================================
export const sendDailySummaryToParent = async (studentId, date) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    const parentUserIds = await getParentNotificationUserIds(student);
    if (parentUserIds.length === 0) {
      console.log(`   ℹ️ No parent account for ${student.name}`);
      return;
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const attendance = await Attendance.find({
      studentId,
      date: { $gte: startOfDay, $lte: endOfDay },
    });

    if (attendance.length === 0) return;

    const present = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const isAllPresent = present === attendance.length;

    await Promise.all(
      parentUserIds.map((userId) =>
        sendPushToUser(userId, {
          title: isAllPresent
            ? '✅ Perfect Day for ' + student.name.split(' ')[0]
            : '📊 Daily Update',
          body: isAllPresent
            ? `${student.name} आज ${present}/${attendance.length} lectures attend केले 🎉`
            : `${student.name} — आज ${present}/${attendance.length} lectures attend (${((present / attendance.length) * 100).toFixed(0)}%)`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `parent-daily-${studentId}-${date}`,
          data: {
            url: '/parent/dashboard',
            studentId,
          },
        })
      )
    );

    console.log(`📤 Daily summary sent to parent of ${student.name}`);
  } catch (error) {
    console.error('Parent daily summary error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 2: Defaulter Alert to Parent
// ============================================
export const sendDefaulterAlertToParent = async (studentId, percentage) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    const parentUserIds = await getParentNotificationUserIds(student);
    if (parentUserIds.length === 0) return;

    await Promise.all(
      parentUserIds.map((userId) =>
        sendPushToUser(userId, {
          title: `⚠️ Attendance Alert: ${student.name.split(' ')[0]}`,
          body: `तुमच्या मुलाची attendance ${percentage.toFixed(1)}% आहे — 75% पेक्षा कमी! कृपया लक्ष द्या.`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `parent-defaulter-${studentId}`,
          requireInteraction: true,
          data: {
            url: '/parent/dashboard',
            studentId,
          },
        })
      )
    );

    console.log(`📤 Defaulter alert sent to parent of ${student.name}`);
  } catch (error) {
    console.error('Parent defaulter alert error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 3: Repeated Absence (3 days)
// ============================================
export const checkRepeatedAbsenceForParent = async (studentId) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recent = await Attendance.find({
      studentId,
      date: { $gte: threeDaysAgo },
    });

    if (recent.length === 0) return;

    // Group by date
    const dateMap = {};
    recent.forEach((a) => {
      const dateStr = new Date(a.date).toISOString().split('T')[0];
      if (!dateMap[dateStr]) dateMap[dateStr] = { present: 0, total: 0 };
      dateMap[dateStr].total++;
      if (a.status === 'Present' || a.status === 'Late') {
        dateMap[dateStr].present++;
      }
    });

    // सलग 3 दिवस absent?
    const absentDays = Object.entries(dateMap).filter(
      ([_, data]) => data.present === 0
    ).length;

    if (absentDays >= 3) {
      const parentUserIds = await getParentNotificationUserIds(student);
      if (parentUserIds.length === 0) return;

      await Promise.all(
        parentUserIds.map((userId) =>
          sendPushToUser(userId, {
            title: `🚨 ${student.name.split(' ')[0]} 3 Days Absent`,
            body: `तुमचे मूल 3 दिवस सलग absent आहे! कृपया तातडीने संपर्क करा.`,
            icon: '/logo192.png',
            badge: '/logo192.png',
            tag: `parent-repeated-${studentId}`,
            requireInteraction: true,
            data: {
              url: '/parent/dashboard',
              studentId,
            },
          })
        )
      );

      console.log(`📤 Repeated absence alert sent to parent of ${student.name}`);
    }
  } catch (error) {
    console.error('Repeated absence error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 4: Holiday for Parents
// ============================================
export const notifyParentsHoliday = async (holiday) => {
  try {
    const studentFilter = { isActive: true };
    if (holiday.schoolId) studentFilter.schoolId = holiday.schoolId;
    const students = await Student.find(studentFilter).select(
      '_id parentUserId name schoolId'
    );
    const recipients = new Map();

    for (const student of students) {
      const parentUserIds = await getParentNotificationUserIds(student);
      for (const userId of parentUserIds) {
        const key = userId.toString();
        if (!recipients.has(key)) recipients.set(key, new Set());
        recipients.get(key).add(student.name.split(' ')[0]);
      }
    }

    const endDate = holiday.endDate
      ? new Date(holiday.endDate)
      : new Date(holiday.date);
    const isSingleDay =
      new Date(holiday.date).toDateString() === endDate.toDateString();

    await Promise.all(
      [...recipients.entries()].map(([userId, childNames]) =>
        sendPushToUser(userId, {
          title: `🎉 ${holiday.name}`,
          body: isSingleDay
            ? `आज Holiday आहे: ${holiday.name}${childNames.size ? ` — ${[...childNames].join(', ')} चा पण` : ''}`
            : `${holiday.name}: ${new Date(holiday.date).toLocaleDateString('en-IN')} ते ${endDate.toLocaleDateString('en-IN')}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `parent-holiday-${holiday._id}`,
          data: { url: '/parent/dashboard' },
        })
      )
    );

    console.log(`📤 Holiday sent to ${recipients.size} parents`);
  } catch (error) {
    console.error('Parent holiday error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 5: Monthly Report to Parent
// ============================================
export const sendMonthlyReportToParent = async (studentId, month) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    const parentUserIds = await getParentNotificationUserIds(student);
    if (parentUserIds.length === 0) return;

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);

    const attendance = await Attendance.find({
      studentId,
      date: { $gte: startDate, $lte: endDate },
    });

    if (attendance.length === 0) return;

    const present = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const percentage = ((present / attendance.length) * 100).toFixed(1);

    await Promise.all(
      parentUserIds.map((userId) =>
        sendPushToUser(userId, {
          title: `📊 Monthly Report: ${student.name.split(' ')[0]}`,
          body: `${month} — ${present}/${attendance.length} (${percentage}%)\n${percentage >= 75 ? '✅ Eligible for exams' : '⚠️ Below 75%'}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `parent-monthly-${studentId}-${month}`,
          data: {
            url: '/parent/dashboard',
            studentId,
            month,
          },
        })
      )
    );
  } catch (error) {
    console.error('Monthly report error:', error);
  }
};