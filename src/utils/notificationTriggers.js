import { sendPushToUser, sendPushToRole, sendPushToUsers } from '../services/pushService.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';

export const notifyAdminAttendanceMarked = async ({
  teacherName,
  className,
  divisionName,
  subjectName,
  lectureId,
  present,
  total,
  percentage,
}) => {
  try {
    await sendPushToRole('admin', {
      title: '✅ Attendance Marked',
      body: `${teacherName} ने ${className}-${divisionName} • ${subjectName} मध्ये attendance भरली — ${present}/${total} (${percentage}%)`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `attendance-${lectureId}`,
      data: {
        url: '/admin/reports',
        lectureId,
      },
    });

    if (Number(percentage) < 60) {
      await sendPushToRole('admin', {
        title: '⚠️ Low Attendance Alert',
        body: `${className}-${divisionName} • ${subjectName} मध्ये फक्त ${percentage}% present!`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `low-att-${lectureId}`,
        data: { url: '/admin/reports' },
      });
    }

    console.log(`📤 Admin notified: Attendance by ${teacherName}`);
  } catch (error) {
    console.error('Admin attendance notify error:', error);
  }
};

export const notifyParentAttendance = async ({
  studentId,
  status,
  subjectName,
  date,
}) => {
  try {
    if (status !== 'Absent') return;

    const student = await Student.findById(studentId).select('name');
    if (!student) {
      throw new Error(`Student ${studentId} was not found`);
    }

    const parents = await User.find({
      studentId: student._id,
      role: 'parent',
      isActive: true,
    }).select('_id');

    if (parents.length === 0) return;

    const dateLabel = new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
    await sendPushToUsers(
      parents.map((parent) => parent._id),
      {
        title: `⚠️ ${student.name} आज Absent`,
        body: `${student.name} आज ${subjectName} ला absent होता (${dateLabel})`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `absent-${studentId}-${new Date(date).toISOString().slice(0, 10)}-${subjectName}`,
        data: {
          url: '/parent/dashboard',
          studentId,
        },
        actions: [{ action: 'view', title: 'View Details' }],
      }
    );

    console.log(`📤 Parent notified: ${student.name} absent`);
  } catch (error) {
    console.error('Parent notify error:', error);
  }
};

export const notifyHolidayAdded = async (holiday) => {
  try {
    const startDate = new Date(holiday.date);
    const endDate = holiday.endDate ? new Date(holiday.endDate) : null;
    const dateText = endDate
      ? `${startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ते ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
      : startDate.toLocaleDateString('en-IN', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
    const icon =
      holiday.type === 'Vacation'
        ? '🏖️'
        : holiday.type === 'Exam'
          ? '📝'
          : holiday.type === 'College'
            ? '🏫'
            : '🎊';
    const payload = {
      title: `${icon} ${holiday.name}`,
      body: `📅 ${dateText}${holiday.description ? `\n${holiday.description}` : ''}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `holiday-${holiday._id}`,
      data: {
        url: '/teacher/timetable',
        holidayName: holiday.name,
      },
    };
    const deliveries = await Promise.allSettled(
      ['teacher', 'student', 'parent'].map((role) =>
        sendPushToRole(role, payload)
      )
    );

    deliveries.forEach((delivery, index) => {
      const role = ['teacher', 'student', 'parent'][index];
      if (delivery.status === 'rejected') {
        console.error(`Holiday notify failed for ${role}:`, delivery.reason);
      } else {
        console.log(`📤 Holiday notified to ${role}s: ${holiday.name}`);
      }
    });
  } catch (error) {
    console.error('Holiday notify error:', error);
  }
};

export const notifyStudentLectureReminder = async ({
  studentUserId,
  studentName,
  subjectName,
  className,
  divisionName,
  startTime,
  room,
  lectureId,
}) => {
  try {
    if (!studentUserId) return;

    await sendPushToUser(studentUserId, {
      title: '⏰ Lecture Reminder',
      body: `${startTime} ला ${subjectName} चा lecture आहे — ${className}-${divisionName}${room ? ` • 📍 ${room}` : ''}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `student-lecture-${lectureId}`,
      data: {
        url: '/student/dashboard',
        lectureId,
      },
      actions: [{ action: 'view', title: 'View Timetable' }],
    });

    console.log(`📤 Lecture reminder sent to ${studentName}`);
  } catch (error) {
    console.error(`Student reminder failed for ${studentName}:`, error);
  }
};

// ============================================
// 🎯 TRIGGER 1: Attendance भरल्यावर Defaulter Check
// ============================================
export const checkDefaulterAfterAttendance = async (studentId, classId, divisionName, teacherId) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    // Total attendance count
    const total = await Attendance.countDocuments({ studentId });
    if (total < 10) return; // Too few records

    const present = await Attendance.countDocuments({
      studentId,
      status: { $in: ['Present', 'Late'] },
    });

    const percentage = (present / total) * 100;

    // जर 75% पेक्षा कमी झालं
    if (percentage < 75 && percentage > 70) {
      // Class Teacher शोध
      const classTeacher = await User.findOne({
        role: 'teacher',
        isActive: true,
        assignments: {
          $elemMatch: {
            classId,
            divisionName,
            role: 'ClassTeacher',
          },
        },
      });

      if (classTeacher) {
        await sendPushToUser(classTeacher._id, {
          title: '⚠️ Defaulter Alert',
          body: `${student.name} (${student.classId?.name}-${student.divisionName}) ची attendance ${percentage.toFixed(1)}% झाली`,
          icon: '/logo192.png',
          badge: '/badge.png',
          tag: `defaulter-${studentId}`,
          data: {
            url: `/teacher/students`,
            studentId: student._id,
          },
          actions: [
            { action: 'view', title: 'View Student' },
            { action: 'send-alert', title: 'Send Parent Alert' },
          ],
        });
      }
    }
  } catch (error) {
    console.error('Defaulter trigger error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 2: New Attendance भरल्यावर Admin ला
// ============================================
export const notifyAdminAfterAttendance = async (data) => {
  try {
    const { teacherName, className, divisionName, subjectName, present, total } = data;

    const percentage = total > 0 ? ((present / total) * 100).toFixed(0) : 0;

    // फक्त जर attendance 60% पेक्षा कमी असेल
    if (percentage < 60) {
      await sendPushToRole('admin', {
        title: '⚠️ Low Attendance Alert',
        body: `${teacherName} ने ${className}-${divisionName} • ${subjectName} मध्ये ${present}/${total} (${percentage}%) नोंदवले`,
        icon: '/logo192.png',
        badge: '/badge.png',
        tag: `low-att-${Date.now()}`,
        data: {
          url: '/admin/reports',
        },
      });
    }
  } catch (error) {
    console.error('Admin notify error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 3: Teacher Compliance Alert (Admin ला)
// ============================================
export const notifyAdminTeacherCompliance = async (pendingTeachers) => {
  try {
    if (pendingTeachers.length === 0) return;

    await sendPushToRole('admin', {
      title: '🔴 Teacher Compliance Alert',
      body: `आज ${pendingTeachers.length} teachers ने attendance भरली नाही`,
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: 'compliance-daily',
      data: {
        url: '/admin/reports?tab=teachers',
        teachers: pendingTeachers,
      },
    });
  } catch (error) {
    console.error('Compliance notify error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 4: Student Repeated Absent (3 days)
// ============================================
export const checkRepeatedAbsence = async (studentId) => {
  try {
    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) return;

    // Last 3 days attendance
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const recent = await Attendance.find({
      studentId,
      date: { $gte: threeDaysAgo },
    });

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

    // Check if all days absent
    const absentDates = Object.entries(dateMap).filter(
      ([_, data]) => data.present === 0
    );

    if (absentDates.length >= 3) {
      // Class Teacher शोध
      const classTeacher = await User.findOne({
        role: 'teacher',
        isActive: true,
        assignments: {
          $elemMatch: {
            classId: student.classId._id,
            divisionName: student.divisionName,
            role: 'ClassTeacher',
          },
        },
      });

      if (classTeacher) {
        await sendPushToUser(classTeacher._id, {
          title: '⚠️ Repeated Absence',
          body: `${student.name} 3 दिवस सलग absent आहे! कृपया parent ला कळवा.`,
          icon: '/logo192.png',
          badge: '/badge.png',
          tag: `absent-${studentId}`,
          data: {
            url: `/teacher/students`,
            studentId: student._id,
          },
        });
      }
    }
  } catch (error) {
    console.error('Repeated absence error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 5: Holiday Notification (सगळ्यांना)
// ============================================
export const notifyHoliday = async (holiday) => {
  try {
    await sendPushToRole('teacher', {
      title: `🎉 ${holiday.name}`,
      body:
        holiday.startDate === holiday.endDate
          ? `आज Holiday आहे: ${holiday.name}`
          : `${holiday.name}: ${holiday.startDate} ते ${holiday.endDate}`,
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: `holiday-${holiday._id}`,
      data: {
        url: '/teacher/timetable',
      },
    });
  } catch (error) {
    console.error('Holiday notify error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 6: New Student Added (Admin ला)
// ============================================
export const notifyAdminNewStudent = async (student, teacherName) => {
  try {
    await sendPushToRole('admin', {
      title: '✅ New Student Added',
      body: `${student.name} (${student.studentId}) — ${student.classId?.name}-${student.divisionName} (by ${teacherName})`,
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: `new-student-${student._id}`,
      data: {
        url: '/admin/teachers',
      },
    });
  } catch (error) {
    console.error('New student notify error:', error);
  }
};

// ============================================
// 🎯 TRIGGER 7: New Timetable/Lecture Added (Admin ला)
// ============================================
export const notifyAdminNewTimetable = async (timetableData) => {
  try {
    const {
      teacherName,
      teacherId,
      subjectName,
      className,
      divisionName,
      dayOfWeek,
      startTime,
      endTime,
      room,
    } = timetableData;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    await sendPushToRole('admin', {
      title: '📅 New Lecture Added',
      body: `${teacherName} (${teacherId}) ने ${className}-${divisionName} ला ${subjectName} चा lecture add केला — ${days[dayOfWeek]} ${startTime}-${endTime}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `new-lecture-${Date.now()}`,
      data: {
        url: '/admin/timetable',
        teacherId,
        subject: subjectName,
        time: `${startTime}-${endTime}`,
      },
      actions: [
        { action: 'view', title: 'View Timetable' },
      ],
    });

    console.log(`📤 Admin notified: New lecture by ${teacherName}`);
  } catch (error) {
    console.error('New timetable notify error:', error);
  }
};