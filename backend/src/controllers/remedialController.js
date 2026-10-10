import RemedialClass from '../models/RemedialClass.js';
import Student from '../models/Student.js';

// @desc    Create remedial class
// @route   POST /api/remedial
export const createRemedial = async (req, res) => {
  try {
    const {
      classId,
      className,
      divisionName,
      subjectId,
      subjectName,
      date,
      startTime,
      endTime,
      room,
      reason,
      studentIds,
      notes,
    } = req.body;

    if (!classId || !subjectId || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'सगळी fields आवश्यक',
      });
    }

    // Fetch student details
    const students = [];
    if (studentIds && studentIds.length > 0) {
      const studentList = await Student.find({
        _id: { $in: studentIds },
      });

      studentList.forEach((s) => {
        students.push({
          studentId: s._id,
          name: s.name,
          rollNumber: s.rollNumber,
          present: false,
        });
      });
    }

    const remedial = await RemedialClass.create({
      classId,
      className,
      divisionName,
      subjectId,
      subjectName,
      teacherId: req.user.id,
      teacherName: req.user.name,
      date: new Date(date),
      startTime,
      endTime,
      room,
      reason,
      students,
      notes,
    });

    res.status(201).json({
      success: true,
      message: '✅ Remedial class scheduled',
      data: remedial,
    });
  } catch (error) {
    console.error('🔥 REMEDIAL ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all remedial classes (teacher)
// @route   GET /api/remedial/my
export const getMyRemedials = async (req, res) => {
  try {
    const list = await RemedialClass.find({ teacherId: req.user.id })
      .populate('classId', 'name academicYear')
      .populate('subjectId', 'name code')
      .sort({ date: -1 });

    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all (admin)
// @route   GET /api/remedial/all
export const getAllRemedials = async (req, res) => {
  try {
    const list = await RemedialClass.find()
      .populate('teacherId', 'name teacherId')
      .populate('classId', 'name')
      .sort({ date: -1 })
      .limit(500);

    res.status(200).json({
      success: true,
      count: list.length,
      data: list,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark student present/absent
// @route   PUT /api/remedial/:id/mark
export const markAttendance = async (req, res) => {
  try {
    const { studentId, present } = req.body;

    const remedial = await RemedialClass.findById(req.params.id);
    if (!remedial) {
      return res.status(404).json({ success: false, message: 'नाही' });
    }

    const student = remedial.students.find(
      (s) => s.studentId.toString() === studentId
    );
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student नाही' });
    }

    student.present = present;
    await remedial.save();

    res.status(200).json({
      success: true,
      message: '✅ Marked',
      data: remedial,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update status
// @route   PUT /api/remedial/:id/status
export const updateRemedialStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const remedial = await RemedialClass.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: '✅ Status updated',
      data: remedial,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get NAAC report
// @route   GET /api/remedial/naac-report
export const getRemedialReport = async (req, res) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const total = await RemedialClass.countDocuments({
      date: { $gte: firstOfMonth },
    });
    const conducted = await RemedialClass.countDocuments({
      date: { $gte: firstOfMonth },
      status: 'conducted',
    });

    // Total students helped
    const remedials = await RemedialClass.find({
      date: { $gte: firstOfMonth },
    });

    const uniqueStudents = new Set();
    let totalAttended = 0;

    remedials.forEach((r) => {
      r.students.forEach((s) => {
        uniqueStudents.add(s.studentId.toString());
        if (s.present) totalAttended++;
      });
    });

    res.status(200).json({
      success: true,
      data: {
        totalScheduled: total,
        conducted,
        uniqueStudentsHelped: uniqueStudents.size,
        totalAttendances: totalAttended,
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

// @desc    Delete
// @route   DELETE /api/remedial/:id
export const deleteRemedial = async (req, res) => {
  try {
    await RemedialClass.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: '✅ Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};