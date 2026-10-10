import Lecture from '../models/Lecture.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';

// ============================================
// @desc    Teacher for notifications
// @route   GET /api/teacher-notifications
// ============================================
export const getTeacherNotifications = async (req, res) => {
  try {
    const notifications = [];
    const teacherId = req.user.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('🔔 Teacher Notifications requested for:', teacherId);

    // ============================================
    // 1. 🔴 today’s Pending Lectures
    // ============================================
    const todayLectures = await Lecture.find({
      teacherId,
      date: { $gte: today, $lt: tomorrow },
      isActive: true,
      status: 'Scheduled',
    })
      .populate('subjectId', 'name code')
      .populate('classId', 'name');

    console.log(`   📚 Today pending lectures: ${todayLectures.length}`);

    todayLectures.forEach((l) => {
      notifications.push({
        id: `pending-${l._id}`,
        type: 'warning',
        icon: '🔴',
        title: `today ${l.startTime} to ${l.subjectId?.name} of lecture is`,
        message: `${l.classId?.name}-${l.divisionName} • Attendance pending is`,
        time: l.date,
        priority: 1,
        link: '/teacher/attendance',
        meta: {
          subjectName: l.subjectId?.name,
          className: l.classId?.name,
          divisionName: l.divisionName,
          startTime: l.startTime,
          endTime: l.endTime,
        },
      });
    });

    // ============================================
    // 2. ✅ Recent Attendance (last 24 hours)
    // ============================================
    const dayAgo = new Date();
    dayAgo.setHours(dayAgo.getHours() - 24);

    const recentLectures = await Lecture.find({
      teacherId,
      status: 'Conducted',
      updatedAt: { $gte: dayAgo },
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('classId', 'name')
      .sort({ updatedAt: -1 })
      .limit(5);

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
          type: percentage >= 75 ? 'success' : 'warning',
          icon: '✅',
          title: `Attendance marked — ${lecture.subjectId?.name}`,
          message: `${lecture.classId?.name}-${lecture.divisionName} • ${present}/${total} present (${percentage}%)`,
          time: lecture.updatedAt,
          priority: 5,
          link: '/teacher/attendance',
          meta: {
            subjectName: lecture.subjectId?.name,
            className: lecture.classId?.name,
            divisionName: lecture.divisionName,
            present,
            total,
            percentage,
          },
        });
      }
    }

    // ============================================
    // 3. 📅 Upcoming Holidays (7 in days)
    // ============================================
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const teacher = await User.findById(teacherId);
    const schoolIds = [
      ...new Set(
        (teacher?.assignments || [])
          .map((a) => a.schoolId?._id?.toString() || a.schoolId?.toString())
          .filter(Boolean)
      ),
    ];

    const upcomingHolidays = await Holiday.find({
      isActive: true,
      $or: [
        { schoolId: { $in: schoolIds } },
        { schoolId: null },
        { schoolId: { $exists: false } },
      ],
      date: { $gte: today, $lte: nextWeek },
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
        link: '/teacher/timetable',
      });
    });

    // ============================================
    // 4. 📚 today’s all Lectures
    // ============================================
    const allTodayLectures = await Lecture.find({
      teacherId,
      date: { $gte: today, $lt: tomorrow },
      isActive: true,
    })
      .populate('subjectId', 'name')
      .populate('classId', 'name')
      .sort({ startTime: 1 });

    if (allTodayLectures.length > 0) {
      notifications.push({
        id: 'today-lectures',
        type: 'info',
        icon: '📚',
        title: `today ${allTodayLectures.length} lectures are`,
        message: allTodayLectures
          .map((l) => `${l.startTime} ${l.subjectId?.name}`)
          .slice(0, 3)
          .join(' • '),
        time: new Date(),
        priority: 4,
        link: '/teacher/timetable',
      });
    }

    // Sort by priority
    notifications.sort((a, b) => a.priority - b.priority);

    console.log(`✅ Total notifications: ${notifications.length}`);

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount: notifications.filter((n) => n.priority <= 2).length,
      data: notifications,
    });
  } catch (error) {
    console.error('🔥 TEACHER NOTIFICATIONS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};