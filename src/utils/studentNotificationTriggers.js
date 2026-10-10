import { sendPushToUser } from '../services/pushService.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import {
  getParentNotificationUserIds,
  getStudentNotificationUserId,
} from './studentNotificationRecipients.js';

// ============================================
// 🎯 TRIGGER 1: Daily Attendance Summary
// ============================================
export const sendDailySummaryToStudent = async (studentId, date) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');
    if (!student) return;
    const userId = await getStudentNotificationUserId(student);
    if (!userId) return;

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
    const percentage = ((present / attendance.length) * 100).toFixed(0);
    const isAllPresent = present === attendance.length;

    await sendPushToUser(userId, {
      title: isAllPresent ? '✅ Perfect Day!' : '📊 Daily Summary',
      body: isAllPresent
        ? `आज तू ${present}/${attendance.length} lectures attend केले — शाब्बास! 🎉`
        : `आज तू ${present}/${attendance.length} lectures attend केले (${percentage}%)`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `daily-${date}`,
      data: {
        url: '/student/dashboard',
        type: 'daily-summary',
      },
    });

    console.log(`📤 Daily summary sent to ${student.name}`);
  } catch (error) {
    console.error('Student daily summary error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 2: Low Attendance Warning / Perfect Celebration
// ============================================
export const checkStudentLowAttendance = async (studentId) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');
    if (!student) return;
    const userId = await getStudentNotificationUserId(student);
    if (!userId) return;

    const total = await Attendance.countDocuments({ studentId });
    if (total < 10) return; // कमी records असतील तर skip

    const present = await Attendance.countDocuments({
      studentId,
      status: { $in: ['Present', 'Late'] },
    });

    const percentage = (present / total) * 100;

    // ⚠️ Low attendance (< 75%)
    if (percentage < 75 && percentage >= 70) {
      await sendPushToUser(userId, {
        title: '⚠️ Attendance Warning',
        body: `तुझी attendance ${percentage.toFixed(1)}% आहे — Minimum 75% आवश्यक! कृपया नियमित ये.`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `low-att-${studentId}`,
        data: {
          url: '/student/dashboard',
          type: 'low-attendance',
        },
      });
    }

    // 🚨 Critical (< 70%)
    if (percentage < 70) {
      await sendPushToUser(userId, {
        title: '🚨 URGENT: Attendance Critical',
        body: `तुझी attendance फक्त ${percentage.toFixed(1)}% आहे! Exam साठी eligible होण्यासाठी तातडीने सुधार करा.`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `critical-att-${studentId}`,
        requireInteraction: true,
        data: {
          url: '/student/dashboard',
          type: 'critical-attendance',
        },
      });
    }

    // 🏆 Perfect attendance (>= 95%)
    if (percentage >= 95) {
      await sendPushToUser(userId, {
        title: '🏆 Excellent Attendance!',
        body: `तुझी attendance ${percentage.toFixed(1)}% आहे — Keep it up! 🎉`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `good-att-${studentId}`,
        data: {
          url: '/student/dashboard',
          type: 'excellent-attendance',
        },
      });
    }
  } catch (error) {
    console.error('Student low attendance error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 3: Holiday Notification (सगळ्या Students ला)
// ============================================
export const notifyStudentsHoliday = async (holiday) => {
  try {
    const filter = { isActive: true };
    if (holiday.schoolId) filter.schoolId = holiday.schoolId;
    const students = await Student.find(filter).select(
      '_id userId name schoolId'
    );
    const endDate = holiday.endDate
      ? new Date(holiday.endDate)
      : new Date(holiday.date);
    const isSingleDay =
      new Date(holiday.date).toDateString() === endDate.toDateString();

    for (const student of students) {
      const userId = await getStudentNotificationUserId(student);
      if (!userId) continue;

      await sendPushToUser(userId, {
        title: `🎉 ${holiday.name}`,
        body:
          isSingleDay
            ? `आज Holiday आहे: ${holiday.name}`
            : `${holiday.name}: ${new Date(holiday.date).toLocaleDateString('en-IN')} ते ${endDate.toLocaleDateString('en-IN')}`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `holiday-${holiday._id}`,
        data: {
          url: '/student/dashboard',
          type: 'holiday',
        },
      });
    }
    console.log(`📤 Holiday sent to ${students.length} students`);
  } catch (error) {
    console.error('Student holiday notify error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 4: Exam Reminder
// ============================================
export const sendExamReminder = async (studentId, examData) => {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;
    const userId = await getStudentNotificationUserId(student);
    if (!userId) return;

    const total = await Attendance.countDocuments({ studentId });
    const present = await Attendance.countDocuments({
      studentId,
      status: { $in: ['Present', 'Late'] },
    });
    const percentage = total > 0 ? (present / total) * 100 : 0;

    await sendPushToUser(userId, {
      title: '📝 Exam Reminder',
      body: `${examData.name} — ${examData.date}\nतुझी attendance: ${percentage.toFixed(1)}% ${
        percentage >= 75 ? '✅ Eligible' : '⚠️ Not Eligible'
      }`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `exam-${examData._id || 'reminder'}`,
      data: { url: '/student/dashboard' },
    });
  } catch (error) {
    console.error('Student exam reminder error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 5: Birthday Wish
// ============================================
export const sendBirthdayWish = async (studentId) => {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;

    const studentUserId = await getStudentNotificationUserId(student);
    if (studentUserId) {
      await sendPushToUser(studentUserId, {
        title: '🎂 Happy Birthday!',
        body: `${student.name}, तुला वाढदिवसाच्या हार्दिक शुभेच्छा! 🎉`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `birthday-${studentId}`,
        data: { url: '/student/dashboard' },
      });
    }

    const parentUserIds = await getParentNotificationUserIds(student);
    await Promise.all(
      parentUserIds.map((userId) =>
        sendPushToUser(userId, {
          title: '🎂 वाढदिवसाच्या शुभेच्छा!',
          body: `${student.name} यांचा आज वाढदिवस आहे. 🎉`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `parent-birthday-${studentId}`,
          data: { url: '/parent/dashboard', studentId },
        })
      )
    );
  } catch (error) {
    console.error('Birthday error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 6: Weekly Performance Report
// ============================================
export const sendWeeklyReport = async (studentId) => {
  try {
    const student = await Student.findById(studentId);
    if (!student) return;
    const userId = await getStudentNotificationUserId(student);
    if (!userId) return;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const attendance = await Attendance.find({
      studentId,
      date: { $gte: weekAgo },
    }).populate('subjectId', 'name');

    if (attendance.length === 0) return;

    const present = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const percentage = ((present / attendance.length) * 100).toFixed(0);

    // Subject-wise best/worst
    const subjectStats = {};
    attendance.forEach((a) => {
      const name = a.subjectId?.name || 'Unknown';
      if (!subjectStats[name]) {
        subjectStats[name] = { total: 0, present: 0 };
      }
      subjectStats[name].total++;
      if (a.status === 'Present' || a.status === 'Late') {
        subjectStats[name].present++;
      }
    });

    let bestSubject = '';
    let worstSubject = '';
    let bestPct = 0;
    let worstPct = 100;

    Object.entries(subjectStats).forEach(([name, data]) => {
      const pct = (data.present / data.total) * 100;
      if (pct > bestPct) {
        bestPct = pct;
        bestSubject = name;
      }
      if (pct < worstPct) {
        worstPct = pct;
        worstSubject = name;
      }
    });

    await sendPushToUser(userId, {
      title: '📊 Weekly Report',
      body: `या आठवड्यात: ${present}/${attendance.length} (${percentage}%)\n🎯 Best: ${bestSubject}\n⚠️ Improve: ${worstSubject}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `weekly-${studentId}`,
      data: { url: '/student/dashboard' },
    });
  } catch (error) {
    console.error('Weekly report error:', error);
  }
};