import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import Lecture from '../models/Lecture.js';
import Timetable from '../models/Timetable.js';
import Subject from '../models/Subject.js';

// ============================================
// Helper: Login असलेल्या user चा student शोध
// ============================================
const getMyStudent = async (userId) => {
  const User = (await import('../models/User.js')).default;
  const user = await User.findById(userId);
  if (!user || !user.studentId) return null;

  return await Student.findById(user.studentId)
    .populate('classId', 'name academicYear')
    .populate('schoolId', 'name code');
};

// ============================================
// @desc    माझी profile
// @route   GET /api/self/profile
// ============================================
export const getMyProfile = async (req, res) => {
  try {
    const student = await getMyStudent(req.user.id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student data सापडला नाही',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          seatNumber: student.seatNumber,
          prnNumber: student.prnNumber,
          studentId: student.studentId,
          gender: student.gender,
          className: student.classId?.name,
          divisionName: student.divisionName,
          academicYear: student.academicYear,
          schoolName: student.schoolId?.name,
          mobile: student.mobile,
          email: student.email,
          parentName: student.parentName,
          parentPhone: student.parentPhone,
        },
      },
    });
  } catch (error) {
    console.error('🔥 PROFILE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    माझी attendance (महिन्यानुसार)
// @route   GET /api/self/attendance?month=2026-10
// ============================================
export const getMyAttendance = async (req, res) => {
  try {
    const student = await getMyStudent(req.user.id);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student नाही' });
    }

    const { month } = req.query;

    let dateFilter = {};
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      dateFilter = {
        $gte: new Date(year, monthNum - 1, 1),
        $lte: new Date(year, monthNum, 0, 23, 59, 59),
      };
    } else {
      const now = new Date();
      dateFilter = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    }

    const attendance = await Attendance.find({
      studentId: student._id,
      date: dateFilter,
    })
      .populate('subjectId', 'name code')
      .populate('lectureId', 'startTime endTime status')
      .sort({ date: 1 });

    const total = attendance.length;
    const present = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;
    const absent = attendance.filter((a) => a.status === 'Absent').length;
    const late = attendance.filter((a) => a.status === 'Late').length;
    const excused = attendance.filter((a) => a.status === 'Excused').length;

    const percentage = total > 0 ? ((present / total) * 100).toFixed(2) : 0;

    // Subject-wise
    const subjectMap = {};
    attendance.forEach((a) => {
      const subjId = a.subjectId?._id?.toString();
      if (!subjId) return;
      if (!subjectMap[subjId]) {
        subjectMap[subjId] = {
          name: a.subjectId.name,
          code: a.subjectId.code,
          total: 0,
          present: 0,
        };
      }
      subjectMap[subjId].total++;
      if (a.status === 'Present' || a.status === 'Late') {
        subjectMap[subjId].present++;
      }
    });

    const subjectWise = Object.values(subjectMap).map((s) => ({
      ...s,
      absent: s.total - s.present,
      percentage:
        s.total > 0 ? ((s.present / s.total) * 100).toFixed(2) : 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        attendance,
        summary: {
          total,
          present,
          absent,
          late,
          excused,
          percentage,
          status: percentage >= 75 ? 'Eligible' : 'Defaulter',
        },
        subjectWise,
      },
    });
  } catch (error) {
    console.error('🔥 ATTENDANCE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    माझे lectures (monthly calendar साठी)
// @route   GET /api/self/lectures?month=2026-10
// ============================================
export const getMyLectures = async (req, res) => {
  try {
    const student = await getMyStudent(req.user.id);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student नाही' });
    }

    const { month } = req.query;

    let dateFilter = {};
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      dateFilter = {
        $gte: new Date(year, monthNum - 1, 1),
        $lte: new Date(year, monthNum, 0, 23, 59, 59),
      };
    }

    const lectures = await Lecture.find({
      classId: student.classId?._id || student.classId,
      divisionName: student.divisionName,
      date: dateFilter,
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name')
      .sort({ date: 1, startTime: 1 });

    // प्रत्येक lecture साठी attendance status
    const attendance = await Attendance.find({
      studentId: student._id,
      lectureId: { $in: lectures.map((l) => l._id) },
    });

    const attendanceMap = {};
    attendance.forEach((a) => {
      attendanceMap[a.lectureId.toString()] = a.status;
    });

    const lecturesWithAttendance = lectures.map((l) => ({
      _id: l._id,
      date: l.date,
      startTime: l.startTime,
      endTime: l.endTime,
      room: l.room,
      status: l.status,
      subjectName: l.subjectId?.name,
      subjectCode: l.subjectId?.code,
      teacherName: l.teacherId?.name,
      myAttendance: attendanceMap[l._id.toString()] || null,
    }));

    res.status(200).json({
      success: true,
      count: lecturesWithAttendance.length,
      data: lecturesWithAttendance,
    });
  } catch (error) {
    console.error('🔥 LECTURES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    माझे timetable (weekly)
// @route   GET /api/self/timetable
// ============================================
export const getMyTimetable = async (req, res) => {
  try {
    const student = await getMyStudent(req.user.id);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student नाही' });
    }

    const timetables = await Timetable.find({
      classId: student.classId?._id || student.classId,
      divisionName: student.divisionName,
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      count: timetables.length,
      data: timetables,
    });
  } catch (error) {
    console.error('🔥 TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};