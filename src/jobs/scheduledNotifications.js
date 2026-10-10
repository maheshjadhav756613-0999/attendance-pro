import cron from 'node-cron';
import User from '../models/User.js';
import Lecture from '../models/Lecture.js';
import Holiday from '../models/Holiday.js';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import { sendPushToUser, sendPushToRole } from '../services/pushService.js';
import {
  notifyAdminTeacherCompliance,
  notifyHoliday,
  notifyStudentLectureReminder,
} from '../utils/notificationTriggers.js';
import {
  notifyStudentsHoliday,
  sendBirthdayWish,
  sendDailySummaryToStudent,
  sendExamReminder,
  sendWeeklyReport,
} from '../utils/studentNotificationTriggers.js';
import {
  notifyParentsHoliday,
  sendDailySummaryToParent,
} from '../utils/parentNotificationTriggers.js';

// ============================================
// ⏰ CRON 1: Lecture Reminder (दर 5 मिनिटांनी check)
// ============================================
cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date();
    const in10Min = new Date(now.getTime() + 10 * 60 * 1000);

    const upcomingLectures = await Lecture.find({
      date: {
        $gte: new Date(now.toISOString().split('T')[0]),
        $lte: new Date(now.toISOString().split('T')[0] + 'T23:59:59'),
      },
      status: 'Scheduled',
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('classId', 'name');

    for (const lecture of upcomingLectures) {
      // Lecture start time parse
      const [hours, minutes] = lecture.startTime.split(':').map(Number);
      const lectureTime = new Date();
      lectureTime.setHours(hours, minutes, 0, 0);

      const diff = (lectureTime - now) / (60 * 1000); // minutes

      // 10 मिनिटं आधी (9-11 range)
      if (diff >= 9 && diff <= 11) {
        await sendPushToUser(lecture.teacherId, {
          title: '⏰ Lecture Reminder',
          body: `${lecture.startTime} ला ${lecture.subjectId?.name} चा lecture आहे — ${lecture.classId?.name}-${lecture.divisionName}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `lecture-teacher-${lecture._id}`,
          data: {
            url: '/teacher/attendance',
            lectureId: lecture._id,
          },
          actions: [{ action: 'take-attendance', title: 'Take Attendance' }],
        });

        const students = await Student.find({
          classId: lecture.classId._id || lecture.classId,
          divisionName: lecture.divisionName,
          isActive: true,
        }).select('_id name');
        const studentUsers = await User.find({
          role: 'student',
          isActive: true,
          studentId: { $in: students.map((student) => student._id) },
        }).select('name studentId');
        const studentsById = new Map(
          students.map((student) => [student._id.toString(), student])
        );

        await Promise.all(
          studentUsers.map((studentUser) => {
            const student = studentsById.get(studentUser.studentId.toString());
            return notifyStudentLectureReminder({
              studentUserId: studentUser._id,
              studentName: student?.name || studentUser.name,
              subjectName: lecture.subjectId?.name || 'Subject',
              className: lecture.classId?.name || 'Class',
              divisionName: lecture.divisionName,
              startTime: lecture.startTime,
              room: lecture.room,
              lectureId: lecture._id,
            });
          })
        );

        const teacherInfo = await User.findById(lecture.teacherId).select(
          'name teacherId'
        );

        await sendPushToRole('admin', {
          title: '⏰ Lecture Starting Soon',
          body: `${teacherInfo?.name || 'Teacher'} चा ${lecture.subjectId?.name} चा lecture ${lecture.startTime} ला — ${lecture.classId?.name}-${lecture.divisionName}`,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: `lecture-admin-${lecture._id}`,
          data: { url: '/admin/timetable' },
        });
      }
    }
  } catch (error) {
    console.error('Lecture reminder error:', error);
  }
});

// ============================================
// ⏰ CRON 2: Teacher Compliance Check (रोज 6 PM)
// ============================================
cron.schedule('0 18 * * *', async () => {
  try {
    console.log('🔔 Running daily compliance check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // आजचे pending lectures
    const pendingLectures = await Lecture.find({
      date: { $gte: today, $lt: tomorrow },
      status: 'Scheduled',
      isActive: true,
    }).populate('teacherId', 'name teacherId');

    // Teacher-wise group
    const pendingByTeacher = {};
    pendingLectures.forEach((l) => {
      const tId = l.teacherId?._id?.toString();
      if (!tId) return;
      if (!pendingByTeacher[tId]) {
        pendingByTeacher[tId] = {
          name: l.teacherId.name,
          teacherId: l.teacherId.teacherId,
          count: 0,
        };
      }
      pendingByTeacher[tId].count++;
    });

    const teacherList = Object.values(pendingByTeacher);

    if (teacherList.length > 0) {
      await notifyAdminTeacherCompliance(teacherList);
    }
  } catch (error) {
    console.error('Compliance check error:', error);
  }
});

// ============================================
// ⏰ CRON 3: Holiday Reminder (रोज सकाळी 7:30 AM)
// ============================================
cron.schedule('30 7 * * *', async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayHolidays = await Holiday.find({
      isActive: true,
      date: { $gte: today, $lt: tomorrow },
    });

    for (const holiday of todayHolidays) {
      await notifyHoliday(holiday);
      await notifyStudentsHoliday(holiday);
      await notifyParentsHoliday(holiday);
    }
  } catch (error) {
    console.error('Holiday reminder error:', error);
  }
});

// ============================================
// 📊 CRON: Daily Student and Parent Summaries (6 PM India time)
// ============================================
cron.schedule(
  '0 18 * * *',
  async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const students = await Student.find({ isActive: true }).select('_id');

      for (const student of students) {
        await sendDailySummaryToStudent(student._id, today);
        await sendDailySummaryToParent(student._id, today);
      }
      console.log(`📊 Daily summaries processed for ${students.length} students`);
    } catch (error) {
      console.error('Daily student/parent summary error:', error);
    }
  },
  { timezone: 'Asia/Kolkata' }
);

// ============================================
// ⏰ CRON 4: Weekly Digest (रविवारी 9 AM)
// ============================================
cron.schedule('0 9 * * 0', async () => {
  try {
    console.log('📊 Sending weekly digest to admins...');

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const totalAttendance = await Attendance.countDocuments({
      date: { $gte: weekAgo },
    });
    const totalPresent = await Attendance.countDocuments({
      date: { $gte: weekAgo },
      status: { $in: ['Present', 'Late'] },
    });
    const percentage =
      totalAttendance > 0
        ? ((totalPresent / totalAttendance) * 100).toFixed(1)
        : 0;

    await sendPushToRole('admin', {
      title: '📊 Weekly Digest',
      body: `या आठवड्याची average attendance: ${percentage}% (${totalPresent}/${totalAttendance})`,
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: 'weekly-digest',
      data: {
        url: '/admin/reports',
      },
    });
  } catch (error) {
    console.error('Weekly digest error:', error);
  }
});

// ============================================
// 📈 CRON: Weekly Student Reports (Sunday 9 AM India time)
// ============================================
cron.schedule(
  '0 9 * * 0',
  async () => {
    try {
      const students = await Student.find({ isActive: true }).select('_id');
      for (const student of students) {
        await sendWeeklyReport(student._id);
      }
      console.log(`📈 Weekly reports processed for ${students.length} students`);
    } catch (error) {
      console.error('Weekly student report error:', error);
    }
  },
  { timezone: 'Asia/Kolkata' }
);

// ============================================
// 🎂 CRON: Student and Parent Birthday Wishes (8 AM India time)
// ============================================
cron.schedule(
  '0 8 * * *',
  async () => {
    try {
      const today = new Date();
      const students = await Student.find({
        isActive: true,
        dateOfBirth: { $exists: true, $ne: null },
      }).select('_id dateOfBirth');

      for (const student of students) {
        const dateOfBirth = new Date(student.dateOfBirth);
        if (
          dateOfBirth.getMonth() === today.getMonth() &&
          dateOfBirth.getDate() === today.getDate()
        ) {
          await sendBirthdayWish(student._id);
        }
      }
    } catch (error) {
      console.error('Birthday notification error:', error);
    }
  },
  { timezone: 'Asia/Kolkata' }
);

console.log('⏰ Scheduled notifications initialized');

import {
  checkRepeatedAbsenceAlert,
  checkPerfectAttendance,
  notifyExamEligibility,
  checkAttendanceTrend,
  checkSubjectWiseWarning,
  predictDefaulters,
  notifyPTMReminder,
} from '../controllers/notificationTriggers.js';

// ✅ Imports तपास — User, Student, Attendance आधीच असावेत

// ============================================
// 📅 CRON 5: Repeated Absence (रोज 6 PM)
// ============================================
cron.schedule('0 18 * * *', async () => {
  try {
    console.log('🚨 Checking repeated absences...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const Student = (await import('../models/Student.js')).default;
    const Attendance = (await import('../models/Attendance.js')).default;

    const students = await Student.find({ isActive: true }).select('_id');

    for (const student of students) {
      await checkRepeatedAbsenceAlert(student._id, 3);
    }

    console.log('✅ Repeated absence check complete');
  } catch (error) {
    console.error('Repeated absence cron error:', error);
  }
});

// ============================================
// 🏆 CRON 6: Perfect Attendance (महिन्याच्या 1 तारखेला 10 AM)
// ============================================
cron.schedule('0 10 1 * *', async () => {
  try {
    console.log('🏆 Checking perfect attendance...');

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const month = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    await checkPerfectAttendance(month);
  } catch (error) {
    console.error('Perfect attendance cron error:', error);
  }
});

// ============================================
// 📈 CRON 7: Attendance Trend (रविवारी 8 AM)
// ============================================
cron.schedule('0 8 * * 0', async () => {
  try {
    console.log('📈 Checking attendance trend...');
    await checkAttendanceTrend();
  } catch (error) {
    console.error('Trend cron error:', error);
  }
});

// ============================================
// 📊 CRON 8: Subject-wise Warning (सोमवारी 9 AM)
// ============================================
cron.schedule('0 9 * * 1', async () => {
  try {
    console.log('📊 Checking subject warnings...');
    await checkSubjectWiseWarning();
  } catch (error) {
    console.error('Subject warn cron error:', error);
  }
});

// ============================================
// 🤖 CRON 9: AI Prediction (महिन्याच्या 15 तारखेला 9 AM)
// ============================================
cron.schedule('0 9 15 * *', async () => {
  try {
    console.log('🤖 Running AI prediction...');
    await predictDefaulters();
  } catch (error) {
    console.error('AI prediction cron error:', error);
  }
});

// ============================================
// 🎓 CRON 10: Exam Eligibility (रोज सकाळी 8 AM)
// ============================================
cron.schedule('0 8 * * *', async () => {
  try {
    const Exam = (await import('../models/Exam.js')).default;

    const now = new Date();
    const in15Days = new Date(now);
    in15Days.setDate(in15Days.getDate() + 15);

    const upcomingExams = await Exam.find({
      isActive: true,
      startDate: { $gte: now, $lte: in15Days },
    });

    for (const exam of upcomingExams) {
      await notifyExamEligibility(exam);

      const startDate = new Date(exam.startDate);
      const examDay = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate()
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilExam = Math.round(
        (examDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
      );

      if (daysUntilExam === 15) {
        const students = await Student.find({
          classId: exam.classId,
          ...(exam.divisionName && { divisionName: exam.divisionName }),
          isActive: true,
        }).select('_id');

        for (const student of students) {
          await sendExamReminder(student._id, exam);
        }
      }
    }
  } catch (error) {
    console.error('Exam eligibility cron error:', error);
  }
});

// ============================================
// 📞 CRON 11: PTM Reminder (रोज सकाळी 8 AM)
// ============================================
cron.schedule('0 8 * * *', async () => {
  try {
    const PTM = (await import('../models/PTM.js')).default;

    const now = new Date();
    const in2Days = new Date(now);
    in2Days.setDate(in2Days.getDate() + 2);
    in2Days.setHours(0, 0, 0, 0);

    const next2Days = new Date(in2Days);
    next2Days.setDate(next2Days.getDate() + 1);

    const upcomingPTMs = await PTM.find({
      isActive: true,
      status: 'Scheduled',
      date: { $gte: in2Days, $lt: next2Days },
    });

    for (const ptm of upcomingPTMs) {
      await notifyPTMReminder(ptm, 2);
    }
  } catch (error) {
    console.error('PTM reminder cron error:', error);
  }
});

console.log('📅 All scheduled notifications initialized');