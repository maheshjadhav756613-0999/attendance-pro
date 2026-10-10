import User from '../models/User.js';
import Lecture from '../models/Lecture.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import Student from '../models/Student.js';

// @desc    Admin for all notifications
// @route   GET /api/notifications
export const getNotifications = async (req, res) => {
  try {
    const notifications = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ============================================
    // 1. 🔴 today’s Pending Lectures
    // ============================================
    const todayLectures = await Lecture.find({
      date: { $gte: today, $lt: tomorrow },
      isActive: true,
      status: 'Scheduled',
    }).populate('teacherId', 'name teacherId');

    const pendingByTeacher = {};
    todayLectures.forEach((l) => {
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

    Object.values(pendingByTeacher).forEach((t) => {
      notifications.push({
        id: `pending-${t.teacherId}`,
        type: 'warning',
        icon: '🔴',
        title: `${t.name} has attendance pending`,
        message: `${t.count} lectures are pending today`,
        time: new Date(),
        priority: 1,
        link: '/admin/reports',
      });
    });

    // ============================================
    // 2. ⚠️ Defaulter Students
    // ============================================
    const students = await Student.find({ isActive: true }).populate(
      'classId',
      'name academicYear'
    );

    const defaulterByClass = {};
    for (const s of students) {
      const studentAtt = await Attendance.countDocuments({
        studentId: s._id,
      });
      if (studentAtt === 0) continue;

      const presentCount = await Attendance.countDocuments({
        studentId: s._id,
        status: { $in: ['Present', 'Late'] },
      });

      const percentage = (presentCount / studentAtt) * 100;

      if (percentage < 75) {
        const classKey = `${s.classId?.name}-${s.divisionName}`;
        if (!defaulterByClass[classKey]) {
          defaulterByClass[classKey] = 0;
        }
        defaulterByClass[classKey]++;
      }
    }

    Object.entries(defaulterByClass).forEach(([className, count]) => {
      notifications.push({
        id: `defaulter-${className}`,
        type: 'danger',
        icon: '⚠️',
        title: `${className} in ${count} Defaulters`,
        message: 'Attendance below 75%',
        time: new Date(),
        priority: 2,
        link: '/admin/reports',
      });
    });

    // ============================================
    // 3. 📅 Upcoming Holidays
    // ============================================
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const upcomingHolidays = await Holiday.find({
      date: { $gte: today, $lte: nextWeek },
      isActive: true,
    }).sort({ date: 1 });

    upcomingHolidays.forEach((h) => {
      const daysLeft = Math.ceil(
        (new Date(h.date) - today) / (1000 * 60 * 60 * 24)
      );
      notifications.push({
        id: `holiday-${h._id}`,
        type: 'info',
        icon: '📅',
        title: `${h.name}`,
        message:
          daysLeft === 0 ? 'Today is a holiday' : `${daysLeft} days until the holiday`,
        time: h.date,
        priority: 3,
        link: '/admin/holidays',
      });
    });

    // ============================================
    // 4. ✅ Recent Teachers Added (7 days)
    // ============================================
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentTeachers = await User.find({
      role: 'teacher',
      createdAt: { $gte: weekAgo },
      isActive: true,
    })
      .select('name teacherId createdAt')
      .sort({ createdAt: -1 })
      .limit(3);

    recentTeachers.forEach((t) => {
      notifications.push({
        id: `teacher-${t._id}`,
        type: 'success',
        icon: '✅',
        title: `New teacher: ${t.name}`,
        message: `${t.teacherId} registered`,
        time: t.createdAt,
        priority: 4,
        link: '/admin/teachers',
      });
    });

    // ============================================
    // 5. ✅ Recent Attendance Marked (last 24 hours)
    // ============================================
    const dayAgo = new Date();
    dayAgo.setHours(dayAgo.getHours() - 24);

    const recentLectures = await Lecture.find({
      status: 'Conducted',
      updatedAt: { $gte: dayAgo },
      isActive: true,
    })
      .populate('teacherId', 'name teacherId')
      .populate('subjectId', 'name code')
      .populate('classId', 'name')
      .sort({ updatedAt: -1 })
      .limit(10);

    for (const lecture of recentLectures) {
      const att = await Attendance.find({ lectureId: lecture._id });
      const present = att.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;
      const total = att.length;

      if (total > 0) {
        const percentage = parseFloat(((present / total) * 100).toFixed(0));

        notifications.push({
          id: `attendance-${lecture._id}`,
          type:
            percentage >= 75
              ? 'success'
              : percentage >= 60
              ? 'warning'
              : 'danger',
          icon: '✅',
          title: `${lecture.teacherId?.name || 'Teacher'} by attendance marked`,
          message: `${lecture.classId?.name}-${lecture.divisionName} • ${lecture.subjectId?.name} • ${present}/${total} present (${percentage}%)`,
          time: lecture.updatedAt,
          priority: percentage < 75 ? 2 : 4,
          link: '/admin/reports',
          meta: {
            teacherName: lecture.teacherId?.name,
            teacherId: lecture.teacherId?.teacherId,
            className: lecture.classId?.name,
            divisionName: lecture.divisionName,
            subjectName: lecture.subjectId?.name,
            present,
            total,
            percentage,
            date: lecture.date,
            startTime: lecture.startTime,
            endTime: lecture.endTime,
          },
        });
      }
    }

    // ============================================
    // 6. 📊 Weekly Attendance Summary
    // ============================================
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const weekAttendance = await Attendance.countDocuments({
      date: { $gte: weekStart },
    });
    const weekPresent = await Attendance.countDocuments({
      date: { $gte: weekStart },
      status: { $in: ['Present', 'Late'] },
    });

    if (weekAttendance > 0) {
      const weekAvg = ((weekPresent / weekAttendance) * 100).toFixed(1);
      notifications.push({
        id: 'weekly-summary',
        type: weekAvg >= 75 ? 'info' : 'warning',
        icon: '📊',
        title: `this weekly Average: ${weekAvg}%`,
        message: `${weekPresent}/${weekAttendance} present`,
        time: new Date(),
        priority: 5,
        link: '/admin/reports',
      });
    }

    // Sort by priority
    notifications.sort((a, b) => a.priority - b.priority);

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount: notifications.filter((n) => n.priority <= 2).length,
      data: notifications,
    });
  } catch (error) {
    console.error('🔥 NOTIFICATIONS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};