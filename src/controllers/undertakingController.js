import Undertaking from '../models/Undertaking.js';
import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';

// @desc    Create undertaking for a student
// @route   POST /api/undertaking
export const createUndertaking = async (req, res) => {
  try {
    const { studentId, reason, dueDate, notes } = req.body;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: 'Student आवश्यक',
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

    // Get current attendance
    const total = await Attendance.countDocuments({ studentId });
    const present = await Attendance.countDocuments({
      studentId,
      status: { $in: ['Present', 'Late'] },
    });
    const percentage =
      total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

    const undertaking = await Undertaking.create({
      studentId,
      studentName: student.name,
      studentRollNumber: student.rollNumber,
      prnNumber: student.prnNumber,
      classId: student.classId?._id,
      className: student.classId?.name,
      divisionName: student.divisionName,
      academicYear: student.academicYear,
      attendanceAtTime: percentage,
      reason: reason || 'Low attendance — requires improvement',
      issuedBy: req.user.id,
      issuedByName: req.user.name,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes,
    });

    res.status(201).json({
      success: true,
      message: '✅ Undertaking तयार झालं',
      data: undertaking,
    });
  } catch (error) {
    console.error('🔥 CREATE UNDERTAKING:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all undertakings (admin/teacher)
// @route   GET /api/undertaking
export const getAllUndertakings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.studentId) filter.studentId = req.query.studentId;

    const list = await Undertaking.find(filter)
      .populate('studentId', 'name rollNumber studentId')
      .populate('issuedBy', 'name teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get student's undertakings
// @route   GET /api/undertaking/student/:studentId
export const getStudentUndertakings = async (req, res) => {
  try {
    const list = await Undertaking.find({
      studentId: req.params.studentId,
    })
      .populate('issuedBy', 'name teacherId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get one undertaking
// @route   GET /api/undertaking/:id
export const getUndertaking = async (req, res) => {
  try {
    const item = await Undertaking.findById(req.params.id)
      .populate('studentId', 'name rollNumber prnNumber')
      .populate('issuedBy', 'name teacherId');

    if (!item) {
      return res.status(404).json({ success: false, message: 'नाही' });
    }

    res.status(200).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Sign undertaking (student / parent / teacher)
// @route   PUT /api/undertaking/:id/sign
export const signUndertaking = async (req, res) => {
  try {
    const { signer } = req.body; // 'student' | 'parent' | 'teacher'

    const item = await Undertaking.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'नाही' });
    }

    if (signer === 'student') {
      item.studentSigned = true;
      item.studentSignedAt = new Date();
    } else if (signer === 'parent') {
      item.parentSigned = true;
      item.parentSignedAt = new Date();
    } else if (signer === 'teacher') {
      item.teacherSigned = true;
      item.teacherSignedAt = new Date();
    }

    // Update status
    const allSigned =
      item.studentSigned && item.parentSigned && item.teacherSigned;
    const someSigned =
      item.studentSigned || item.parentSigned || item.teacherSigned;

    item.status = allSigned
      ? 'completed'
      : someSigned
      ? 'partially-signed'
      : 'pending';

    await item.save();

    res.status(200).json({
      success: true,
      message: '✅ Signed',
      data: item,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Upload signed copy
// @route   PUT /api/undertaking/:id/upload
export const uploadSignedCopy = async (req, res) => {
  try {
    const { signedCopyUrl } = req.body;

    const item = await Undertaking.findByIdAndUpdate(
      req.params.id,
      { signedCopyUrl, status: 'completed' },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ success: false, message: 'नाही' });
    }

    res.status(200).json({
      success: true,
      message: '✅ Uploaded',
      data: item,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete
// @route   DELETE /api/undertaking/:id
export const deleteUndertaking = async (req, res) => {
  try {
    await Undertaking.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: '✅ Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};