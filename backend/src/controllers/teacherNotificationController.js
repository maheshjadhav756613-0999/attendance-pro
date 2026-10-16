import Lecture from '../models/Lecture.js';
import Attendance from '../models/Attendance.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import Leave from '../models/Leave.js';
import Assignment from '../models/Assignment.js';
import Submission from '../models/Submission.js';

// ============================================
// @desc    Teacher Notifications
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
    // 1. 🔴 आजचे Pending Lectures
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
        title: `आज ${l.startTime} ला ${l.subjectId?.name} चा lecture आहे`,
        message: `${l.classId?.name}-${l.divisionName} • Attendance बाकी आहे`,
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
    // 2. ✅ Recent Attendance (शेवटचे 24 तास)
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
          title: `Attendance भरली — ${lecture.subjectId?.name}`,
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
    // 3. 📅 Upcoming Holidays (7 दिवसांत)
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
          daysLeft === 0
            ? 'आज Holiday आहे'
            : `${daysLeft} दिवसांत Holiday`,
        time: h.date,
        priority: 3,
        link: '/teacher/timetable',
      });
    });

    // ============================================
    // 4. 📚 आजचे सगळे Lectures
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
        title: `आज ${allTodayLectures.length} lectures आहेत`,
        message: allTodayLectures
          .map((l) => `${l.startTime} ${l.subjectId?.name}`)
          .slice(0, 3)
          .join(' • '),
        time: new Date(),
        priority: 4,
        link: '/teacher/timetable',
      });
    }

    // ============================================
    // 5. 📝 Pending Leave Requests (Class Teacher)
    // ============================================
    const classTeacherAssignments = (teacher?.assignments || []).filter(
      (a) => a.role === 'ClassTeacher'
    );

    if (classTeacherAssignments.length > 0) {
      const classIds = classTeacherAssignments.map(
        (a) => a.classId?._id || a.classId
      );

      const pendingLeaves = await Leave.find({
        classId: { $in: classIds },
        status: 'Pending',
        isActive: true,
      })
        .populate('studentId', 'name studentId rollNumber')
        .populate('classId', 'name')
        .sort({ createdAt: -1 })
        .limit(10);

      const filteredLeaves = pendingLeaves.filter((leave) => {
        const leaveClassId = leave.classId?._id?.toString();
        return classTeacherAssignments.some((a) => {
          const aClassId = (a.classId?._id || a.classId)?.toString();
          return (
            aClassId === leaveClassId &&
            a.divisionName === leave.divisionName
          );
        });
      });

      filteredLeaves.forEach((leave) => {
        notifications.push({
          id: `leave-${leave._id}`,
          type: 'warning',
          icon: '📝',
          title: `${leave.studentId?.name} ने leave apply केली`,
          message: `${leave.totalDays} दिवस • ${leave.leaveType} • ${
            leave.reason?.substring(0, 50) || ''
          }${leave.reason?.length > 50 ? '...' : ''}`,
          time: leave.createdAt,
          priority: 1,
          link: '/teacher/leave-requests',
          meta: {
            studentName: leave.studentId?.name,
            studentCode: leave.studentId?.studentId,
            fromDate: leave.fromDate,
            toDate: leave.toDate,
            leaveType: leave.leaveType,
            totalDays: leave.totalDays,
          },
        });
      });
    }

    // ============================================
    // 6. 📚 Pending Assignment Submissions
    // ============================================
    const myAssignments = await Assignment.find({
      teacherId,
      isActive: true,
    }).select('_id');

    const myAssignmentIds = myAssignments.map((a) => a._id);

    if (myAssignmentIds.length > 0) {
      const pendingSubmissions = await Submission.find({
        assignmentId: { $in: myAssignmentIds },
        status: 'Pending',
      })
        .populate('studentId', 'name studentId rollNumber')
        .populate({
          path: 'assignmentId',
          select: 'title dueDate totalMarks',
        })
        .sort({ submittedAt: -1 })
        .limit(10);

      pendingSubmissions.forEach((sub) => {
        notifications.push({
          id: `submission-${sub._id}`,
          type: 'warning',
          icon: '📚',
          title: `${sub.studentId?.name} ने assignment submit केली`,
          message: `"${sub.assignmentId?.title}" — Approve/Reject करा`,
          time: sub.submittedAt,
          priority: 1,
          link: '/teacher/assignments',
          meta: {
            studentName: sub.studentId?.name,
            studentCode: sub.studentId?.studentId,
            assignmentTitle: sub.assignmentId?.title,
          },
        });
      });

      // ============================================
      // 7. ⏰ Assignment Due Today
      // ============================================
      const dueTodayAssignments = await Assignment.find({
        teacherId,
        isActive: true,
        dueDate: { $gte: today, $lt: tomorrow },
      }).populate('subjectId', 'name');

      dueTodayAssignments.forEach((a) => {
        notifications.push({
          id: `due-today-${a._id}`,
          type: 'info',
          icon: '⏰',
          title: `आज "${a.title}" ची due date आहे`,
          message: `${a.subjectId?.name} — Students ना reminder पाठवा`,
          time: a.dueDate,
          priority: 2,
          link: '/teacher/assignments',
        });
      });

      // ============================================
      // 8. ✅ Recently Approved Submissions (24 तास)
      // ============================================
      const recentApproved = await Submission.find({
        assignmentId: { $in: myAssignmentIds },
        status: 'Approved',
        reviewedAt: { $gte: dayAgo },
      })
        .populate('studentId', 'name')
        .populate('assignmentId', 'title')
        .sort({ reviewedAt: -1 })
        .limit(5);

      recentApproved.forEach((sub) => {
        notifications.push({
          id: `approved-${sub._id}`,
          type: 'success',
          icon: '✅',
          title: `${sub.studentId?.name} ची assignment Approved`,
          message: `"${sub.assignmentId?.title}"`,
          time: sub.reviewedAt,
          priority: 5,
          link: '/teacher/assignments',
        });
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