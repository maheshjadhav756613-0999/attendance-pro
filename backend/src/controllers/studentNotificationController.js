import Assignment from '../models/Assignment.js';
import Submission from '../models/Submission.js';
import Student from '../models/Student.js';
import Leave from '../models/Leave.js';
import Holiday from '../models/Holiday.js';

// ============================================
// @desc    Student साठी notifications
// @route   GET /api/student-notifications
// ============================================
export const getStudentNotifications = async (req, res) => {
  try {
    const notifications = [];

    const student = await Student.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    // ============================================
    // 1. 📚 New Assignments (शेवटच्या 7 दिवसांत)
    // ============================================
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const newAssignments = await Assignment.find({
      classId: student.classId,
      divisionName: student.divisionName,
      isActive: true,
      createdAt: { $gte: weekAgo },
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    for (const a of newAssignments) {
      const submitted = await Submission.findOne({
        assignmentId: a._id,
        studentId: student._id,
      });

      notifications.push({
        id: `assignment-${a._id}`,
        type: submitted ? 'success' : 'info',
        icon: submitted ? '✅' : '📚',
        title: submitted
          ? `Submitted: ${a.title}`
          : `New Assignment: ${a.title}`,
        message: submitted
          ? `${a.subjectId?.name} — Teacher approval pending`
          : `${a.subjectId?.name} — Due ${new Date(a.dueDate).toLocaleDateString('en-IN')}`,
        time: a.createdAt,
        priority: submitted ? 4 : 2,
        link: '/student/assignments',
        meta: {
          subjectName: a.subjectId?.name,
          teacherName: a.teacherId?.name,
          dueDate: a.dueDate,
        },
      });
    }

    // ============================================
    // 2. ⏰ Due Soon (आज + उद्या)
    // ============================================
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const dueSoon = await Assignment.find({
      classId: student.classId,
      divisionName: student.divisionName,
      isActive: true,
      dueDate: { $gte: today, $lt: dayAfter },
    }).populate('subjectId', 'name');

    for (const a of dueSoon) {
      const submitted = await Submission.findOne({
        assignmentId: a._id,
        studentId: student._id,
      });

      if (!submitted) {
        notifications.push({
          id: `due-${a._id}`,
          type: 'danger',
          icon: '⏰',
          title: `Due Soon: ${a.title}`,
          message: `${a.subjectId?.name} — ${new Date(a.dueDate).toLocaleDateString('en-IN')}`,
          time: new Date(),
          priority: 1,
          link: '/student/assignments',
        });
      }
    }

    // ============================================
    // 3. ✅ Submission Approved/Rejected
    // ============================================
    const dayAgo = new Date();
    dayAgo.setHours(dayAgo.getHours() - 48);

    const recentReviews = await Submission.find({
      studentId: student._id,
      status: { $in: ['Approved', 'Rejected'] },
      reviewedAt: { $gte: dayAgo },
    })
      .populate('assignmentId', 'title')
      .populate('reviewedBy', 'name')
      .sort({ reviewedAt: -1 })
      .limit(5);

    recentReviews.forEach((sub) => {
      notifications.push({
        id: `review-${sub._id}`,
        type: sub.status === 'Approved' ? 'success' : 'danger',
        icon: sub.status === 'Approved' ? '✅' : '❌',
        title: `Assignment ${sub.status}: ${sub.assignmentId?.title}`,
        message: sub.teacherRemark || `By ${sub.reviewedBy?.name || 'Teacher'}`,
        time: sub.reviewedAt,
        priority: 1,
        link: '/student/assignments',
      });
    });

    // ============================================
    // 4. 📝 Leave Status Updates
    // ============================================
    const recentLeaves = await Leave.find({
      studentId: student._id,
      status: { $in: ['Approved', 'Rejected'] },
      reviewedAt: { $gte: dayAgo },
    })
      .populate('reviewedBy', 'name')
      .sort({ reviewedAt: -1 })
      .limit(3);

    recentLeaves.forEach((leave) => {
      notifications.push({
        id: `leave-${leave._id}`,
        type: leave.status === 'Approved' ? 'success' : 'danger',
        icon: leave.status === 'Approved' ? '✅' : '❌',
        title: `Leave ${leave.status}`,
        message: `${leave.totalDays} days — ${leave.teacherRemark || ''}`,
        time: leave.reviewedAt,
        priority: 1,
        link: '/student/my-leaves',
      });
    });

    // Sort by priority
    notifications.sort((a, b) => a.priority - b.priority);

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount: notifications.filter((n) => n.priority <= 2).length,
      data: notifications,
    });
  } catch (error) {
    console.error('🔥 STUDENT NOTIFICATIONS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};