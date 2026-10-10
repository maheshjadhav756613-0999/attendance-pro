import ParentCommunication from '../models/ParentCommunication.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Attendance from '../models/Attendance.js';

// @desc    Log communication
// @route   POST /api/parent-communication
export const logCommunication = async (req, res) => {
  try {
    const {
      studentId,
      type,
      subject,
      message,
      reason,
      attachmentUrl,
      notes,
    } = req.body;

    if (!studentId || !type) {
      return res.status(400).json({
        success: false,
        message: 'Student आणि Type आवश्यक',
      });
    }

    const student = await Student.findById(studentId)
      .populate('classId', 'name');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    // Calculate current attendance %
    const total = await Attendance.countDocuments({ studentId });
    const present = await Attendance.countDocuments({
      studentId,
      status: { $in: ['Present', 'Late'] },
    });
    const percentage =
      total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

    const log = await ParentCommunication.create({
      studentId,
      studentName: student.name,
      studentRollNumber: student.rollNumber,
      classId: student.classId?._id,
      className: student.classId?.name,
      divisionName: student.divisionName,
      teacherId: req.user.id,
      teacherName: req.user.name,
      type,
      subject,
      message,
      reason,
      attendanceAtTime: percentage,
      status: 'sent',
      attachmentUrl,
      notes,
    });

    res.status(201).json({
      success: true,
      message: '✅ Communication logged',
      data: log,
    });
  } catch (error) {
    console.error('🔥 LOG COMM ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get logs for a student
// @route   GET /api/parent-communication/student/:studentId
export const getStudentCommunications = async (req, res) => {
  try {
    const logs = await ParentCommunication.find({
      studentId: req.params.studentId,
    })
      .populate('teacherId', 'name teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my communications (teacher)
// @route   GET /api/parent-communication/my
export const getMyCommunications = async (req, res) => {
  try {
    const filter = { teacherId: req.user.id };
    if (req.query.month) {
      const [year, monthNum] = req.query.month.split('-').map(Number);
      filter.createdAt = {
        $gte: new Date(year, monthNum - 1, 1),
        $lte: new Date(year, monthNum, 0, 23, 59, 59),
      };
    }

    const logs = await ParentCommunication.find(filter)
      .populate('studentId', 'name rollNumber')
      .sort({ createdAt: -1 })
      .limit(200);

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all communications (admin)
// @route   GET /api/parent-communication/all
export const getAllCommunications = async (req, res) => {
  try {
    const logs = await ParentCommunication.find()
      .populate('teacherId', 'name teacherId')
      .populate('studentId', 'name rollNumber')
      .sort({ createdAt: -1 })
      .limit(500);

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update status (parent responded)
// @route   PUT /api/parent-communication/:id
export const updateCommunication = async (req, res) => {
  try {
    const { status, parentResponse, notes } = req.body;

    const update = {};
    if (status) update.status = status;
    if (parentResponse) {
      update.parentResponse = parentResponse;
      update.respondedAt = new Date();
    }
    if (notes !== undefined) update.notes = notes;

    const log = await ParentCommunication.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (!log) {
      return res.status(404).json({ success: false, message: 'Log नाही' });
    }

    res.status(200).json({
      success: true,
      message: '✅ Updated',
      data: log,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete log (admin only)
// @route   DELETE /api/parent-communication/:id
export const deleteCommunication = async (req, res) => {
  try {
    await ParentCommunication.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: '✅ Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    NAAC Report — Parent Communication Summary
// @route   GET /api/parent-communication/naac-report
export const getNaacReport = async (req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total communications
    const total = await ParentCommunication.countDocuments({
      createdAt: { $gte: firstOfMonth },
    });

    // Type-wise
    const byType = await ParentCommunication.aggregate([
      { $match: { createdAt: { $gte: firstOfMonth } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    // Defaulter students communicated
    const uniqueStudents = await ParentCommunication.distinct('studentId', {
      createdAt: { $gte: firstOfMonth },
    });

    // Response rate
    const responded = await ParentCommunication.countDocuments({
      createdAt: { $gte: firstOfMonth },
      status: { $in: ['responded', 'read'] },
    });

    res.status(200).json({
      success: true,
      data: {
        totalCommunications: total,
        uniqueStudentsContacted: uniqueStudents.length,
        responseRate: total > 0 ? ((responded / total) * 100).toFixed(1) : 0,
        byType,
        month: firstOfMonth.toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        }),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};