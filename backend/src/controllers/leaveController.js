import Leave from '../models/Leave.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';
import Lecture from '../models/Lecture.js';
import { sendPushToUser, sendPushToUsers } from '../services/pushService.js';

// ============================================
// @desc    Student/Parent — Leave Apply
// @route   POST /api/leaves
// ============================================
export const applyLeave = async (req, res) => {
  try {
    const { fromDate, toDate, leaveType, reason, attachment } = req.body;

    // ✅ Login user चा role check
    let student = null;
    let appliedBy = 'student';

    if (req.user.role === 'student') {
      student = await Student.findOne({
        userId: req.user.id,
        isActive: true,
      }).populate('classId', 'name academicYear');
    } else if (req.user.role === 'parent') {
      // Parent → त्याचे मूल
      student = await Student.findOne({
        _id: req.user.studentId,
        isActive: true,
      }).populate('classId', 'name academicYear');
      appliedBy = 'parent';
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    if (!fromDate || !toDate || !reason) {
      return res.status(400).json({
        success: false,
        message: 'From Date, To Date आणि Reason आवश्यक',
      });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    if (from > to) {
      return res.status(400).json({
        success: false,
        message: 'From Date To Date पेक्षा लहान असावी',
      });
    }

    const totalDays = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

    // Duplicate check
    const existing = await Leave.findOne({
      studentId: student._id,
      status: 'Pending',
      isActive: true,
      fromDate: { $lte: to },
      toDate: { $gte: from },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'या dates साठी आधीच pending leave आहे',
      });
    }

    const leave = await Leave.create({
      studentId: student._id,
      classId: student.classId?._id || student.classId,
      divisionName: student.divisionName,
      schoolId: student.schoolId,
      fromDate: from,
      toDate: to,
      totalDays,
      leaveType: leaveType || 'Personal',
      reason: reason.trim(),
      attachment: attachment || '',
      status: 'Pending',
      appliedBy,
      appliedByUserId: req.user.id,
    });

    console.log(
      `📝 Leave applied: ${student.name} (${totalDays} days) by ${appliedBy}`
    );

    await notifyClassTeachers(leave, student);

    res.status(201).json({
      success: true,
      message: '✅ Leave application submit झाली',
      data: leave,
    });
  } catch (error) {
    console.error('🔥 APPLY LEAVE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student/Parent — स्वतःच्या leaves
// @route   GET /api/leaves/my
// ============================================
export const getMyLeaves = async (req, res) => {
  try {
    let studentId = null;

    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user.id });
      studentId = student?._id;
    } else if (req.user.role === 'parent') {
      studentId = req.user.studentId;
    }

    if (!studentId) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const leaves = await Leave.find({
      studentId,
      isActive: true,
    })
      .populate('reviewedBy', 'name teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher — Leaves list
// @route   GET /api/leaves/class-teacher
// ============================================
export const getLeavesForClassTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);

    const ctAssignments = (teacher.assignments || []).filter(
      (a) => a.role === 'ClassTeacher'
    );

    if (ctAssignments.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        pendingCount: 0,
        data: [],
        message: 'तू Class Teacher नाही',
      });
    }

    const classIds = ctAssignments.map((a) => a.classId?._id || a.classId);

    const leaves = await Leave.find({
      classId: { $in: classIds },
      isActive: true,
    })
      .populate(
        'studentId',
        'name studentId rollNumber prnNumber mobile email parentPhone parentName'
      )
      .populate('classId', 'name academicYear')
      .populate('reviewedBy', 'name teacherId')
      .populate('appliedByUserId', 'name role')
      .sort({ status: 1, createdAt: -1 });

    // Filter by division
    const filteredLeaves = leaves.filter((leave) => {
      const leaveClassId = leave.classId?._id?.toString();
      return ctAssignments.some(
        (a) =>
          (a.classId?._id || a.classId)?.toString() === leaveClassId &&
          a.divisionName === leave.divisionName
      );
    });

    const pendingCount = filteredLeaves.filter(
      (l) => l.status === 'Pending'
    ).length;

    res.status(200).json({
      success: true,
      count: filteredLeaves.length,
      pendingCount,
      data: filteredLeaves,
    });
  } catch (error) {
    console.error('🔥 GET CLASS TEACHER LEAVES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher — Approve / Reject
// @route   PUT /api/leaves/:id/review
// ============================================
export const reviewLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, teacherRemark } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status Approved किंवा Rejected असावा',
      });
    }

    const leave = await Leave.findById(id).populate('studentId', 'name userId');

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave सापडली नाही',
      });
    }

    // Verify Class Teacher
    const teacher = await User.findById(req.user.id);
    const isClassTeacher = (teacher.assignments || []).some(
      (a) =>
        (a.classId?._id || a.classId)?.toString() ===
          leave.classId.toString() &&
        a.divisionName === leave.divisionName &&
        a.role === 'ClassTeacher'
    );

    if (!isClassTeacher) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Leave आधीच ${leave.status} आहे`,
      });
    }

    leave.status = status;
    leave.reviewedBy = req.user.id;
    leave.reviewedAt = new Date();
    leave.teacherRemark = teacherRemark || '';
    await leave.save();

    console.log(`✅ Leave ${status}: ${leave.studentId?.name}`);

    // Approved → Attendance Excused mark
    if (status === 'Approved') {
      await markExcusedAttendance(leave);
    }

    await notifyStudentOfLeaveDecision(leave, status);

    const populated = await Leave.findById(leave._id)
      .populate('studentId', 'name studentId rollNumber')
      .populate('classId', 'name')
      .populate('reviewedBy', 'name teacherId');

    res.status(200).json({
      success: true,
      message: `✅ Leave ${status === 'Approved' ? 'मंजूर' : 'नामंजूर'} केली`,
      data: populated,
    });
  } catch (error) {
    console.error('🔥 REVIEW LEAVE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const formatLeaveDates = (leave) => {
  const formatDate = (date) =>
    new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return `${formatDate(leave.fromDate)} - ${formatDate(leave.toDate)}`;
};

const notifyClassTeachers = async (leave, student) => {
  try {
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      assignments: {
        $elemMatch: {
          classId: leave.classId,
          divisionName: leave.divisionName,
          role: 'ClassTeacher',
        },
      },
    }).select('_id');

    await sendPushToUsers(
      teachers.map((teacher) => teacher._id),
      {
        title: '📝 New leave application',
        body: `${student.name} applied for leave • ${formatLeaveDates(leave)}`,
        icon: '/logo192.png',
        badge: '/logo192.png',
        tag: `leave-request-${leave._id}`,
        data: { url: '/teacher/leaves', leaveId: leave._id },
      }
    );
  } catch (error) {
    console.error('Class teacher leave notification failed:', error);
  }
};

const notifyStudentOfLeaveDecision = async (leave, status) => {
  try {
    const student = leave.studentId;
    if (!student?.userId) {
      console.error(`Leave decision notification skipped: student ${student?._id} has no user account`);
      return;
    }

    const approved = status === 'Approved';
    await sendPushToUser(student.userId, {
      title: approved ? '✅ Leave approved' : '❌ Leave rejected',
      body: `Your leave request for ${formatLeaveDates(leave)} was ${status.toLowerCase()}${leave.teacherRemark ? `. Remark: ${leave.teacherRemark}` : ''}`,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: `leave-decision-${leave._id}`,
      data: { url: '/student/leaves', leaveId: leave._id },
    });
  } catch (error) {
    console.error('Student leave decision notification failed:', error);
  }
};

// ============================================
// @desc    Pending leaves count (badge)
// @route   GET /api/leaves/pending-count
// ============================================
export const getPendingLeavesCount = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id);
    const ctAssignments = (teacher.assignments || []).filter(
      (a) => a.role === 'ClassTeacher'
    );

    if (ctAssignments.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    const classIds = ctAssignments.map((a) => a.classId?._id || a.classId);

    const leaves = await Leave.find({
      classId: { $in: classIds },
      status: 'Pending',
      isActive: true,
    });

    const count = leaves.filter((leave) => {
      const leaveClassId = leave.classId.toString();
      return ctAssignments.some(
        (a) =>
          (a.classId?._id || a.classId)?.toString() === leaveClassId &&
          a.divisionName === leave.divisionName
      );
    }).length;

    res.status(200).json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// HELPER: Approved leave → Attendance Excused
// ============================================
const markExcusedAttendance = async (leave) => {
  try {
    const lectures = await Lecture.find({
      classId: leave.classId,
      divisionName: leave.divisionName,
      date: { $gte: leave.fromDate, $lte: leave.toDate },
      isActive: true,
    });

    if (lectures.length === 0) return;

    const lectureIds = lectures.map((l) => l._id);

    await Attendance.updateMany(
      {
        lectureId: { $in: lectureIds },
        studentId: leave.studentId,
      },
      {
        $set: {
          status: 'Excused',
          markedAt: new Date(),
        },
      }
    );

    console.log(
      `📝 ${lectures.length} lectures marked as Excused for student ${leave.studentId}`
    );
  } catch (error) {
    console.error('⚠️ Excused attendance error:', error.message);
  }
};