import RemedialClass from '../models/RemedialClass.js';
import Student from '../models/Student.js';
import mongoose from 'mongoose';

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

// @desc    Update a scheduled remedial class
// @route   PUT /api/remedial/:id
export const updateRemedial = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid remedial class ID',
      });
    }

    const remedial = await RemedialClass.findOne({
      _id: req.params.id,
      teacherId: req.user.id,
    });

    if (!remedial) {
      return res.status(404).json({
        success: false,
        message: 'Remedial class सापडला नाही',
      });
    }

    if (remedial.status !== 'scheduled') {
      return res.status(400).json({
        success: false,
        message: 'फक्त scheduled class update करता येतो',
      });
    }

    const {
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

    if (!subjectId || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Subject, date आणि वेळ आवश्यक आहे',
      });
    }

    if (!Array.isArray(studentIds)) {
      return res.status(400).json({
        success: false,
        message: 'विद्यार्थ्यांची यादी आवश्यक आहे',
      });
    }

    const selectedStudentIds = [...new Set(studentIds.map(String))];
    if (selectedStudentIds.some((id) => !mongoose.isValidObjectId(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID',
      });
    }

    const selectedStudents = selectedStudentIds.length
      ? await Student.find({
          _id: { $in: selectedStudentIds },
          classId: remedial.classId,
          divisionName: remedial.divisionName,
        })
      : [];

    if (selectedStudents.length !== selectedStudentIds.length) {
      return res.status(400).json({
        success: false,
        message: 'निवडलेले विद्यार्थी या class/division मधील नाहीत',
      });
    }

    const existingAttendance = new Map(
      remedial.students.map((student) => [
        student.studentId.toString(),
        student.present,
      ])
    );
    remedial.subjectId = subjectId;
    remedial.subjectName = subjectName;
    remedial.date = new Date(date);
    remedial.startTime = startTime;
    remedial.endTime = endTime;
    remedial.room = room;
    remedial.reason = reason;
    remedial.notes = notes;
    remedial.students = selectedStudents.map((student) => ({
      studentId: student._id,
      name: student.name,
      rollNumber: student.rollNumber,
      present: existingAttendance.get(student._id.toString()) || false,
    }));

    await remedial.save();

    res.status(200).json({
      success: true,
      message: '✅ Remedial class updated',
      data: remedial,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    console.error('🔥 UPDATE REMEDIAL ERROR:', error);
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