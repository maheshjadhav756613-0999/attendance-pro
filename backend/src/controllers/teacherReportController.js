import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Subject from '../models/Subject.js';
import User from '../models/User.js';

const getDateFilter = ({ startDate, endDate, month }) => {
  if (startDate || endDate) {
    const parseDate = (value, isEndDate) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

      const [year, monthNumber, day] = value.split('-').map(Number);
      const date = new Date(year, monthNumber - 1, day);
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== monthNumber - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      if (isEndDate) date.setHours(23, 59, 59, 999);
      return date;
    };

    const start = startDate ? parseDate(startDate, false) : null;
    const end = endDate ? parseDate(endDate, true) : null;
    if ((startDate && !start) || (endDate && !end) || (start && end && start > end)) {
      return { error: 'Enter a valid date range' };
    }

    const date = {};
    if (start) date.$gte = start;
    if (end) date.$lte = end;
    return { filter: { date } };
  }

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return { error: 'Enter a valid month' };
    }
    const [year, monthNum] = month.split('-').map(Number);
    if (!year || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return { error: 'Enter a valid month' };
    }
    return {
      filter: {
        date: {
          $gte: new Date(year, monthNum - 1, 1),
          $lte: new Date(year, monthNum, 0, 23, 59, 59, 999),
        },
      },
    };
  }

  return { filter: {} };
};

// ============================================
// @desc    Teacher of all classes of overview
// @route   GET /api/teacher-reports/overview
// ============================================
export const getTeacherOverview = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id)
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.subjectId', 'name code');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    const classMap = {};

    (teacher.assignments || []).forEach((a) => {
      const key = `${a.classId?._id}-${a.divisionName}`;
      if (!classMap[key]) {
        classMap[key] = {
          classId: a.classId?._id,
          className: a.classId?.name,
          academicYear: a.classId?.academicYear,
          divisionName: a.divisionName,
          schoolName: a.schoolId?.name,
          isClassTeacher: false,
          subjects: [],
        };
      }
      if (a.role === 'ClassTeacher') {
        classMap[key].isClassTeacher = true;
      }
      if (a.subjectId) {
        const subjectId = a.subjectId._id.toString();
        if (!classMap[key].subjects.some((subject) => subject._id === subjectId)) {
          classMap[key].subjects.push({
            _id: subjectId,
            name: a.subjectId.name,
            code: a.subjectId.code,
          });
        }
      }
    });

    const classes = Object.values(classMap);
    const subjects = await Subject.find({
      classId: { $in: classes.map((classInfo) => classInfo.classId) },
      isActive: true,
    })
      .select('_id classId name code')
      .sort({ name: 1 });

    const subjectsByClass = new Map();
    subjects.forEach((subject) => {
      const classId = subject.classId.toString();
      const classSubjects = subjectsByClass.get(classId) || [];
      classSubjects.push({
        _id: subject._id.toString(),
        name: subject.name,
        code: subject.code,
      });
      subjectsByClass.set(classId, classSubjects);
    });

    classes.forEach((classInfo) => {
      classInfo.subjects = subjectsByClass.get(classInfo.classId.toString()) || [];
    });

    // each class of student count + attendance
    const classesWithStats = await Promise.all(
      classes.map(async (c) => {
        const studentCount = await Student.countDocuments({
          classId: c.classId,
          divisionName: c.divisionName,
          isActive: true,
        });

        const totalLectures = await Lecture.countDocuments({
          teacherId: req.user.id,
          classId: c.classId,
          divisionName: c.divisionName,
          isActive: true,
        });

        const conducted = await Lecture.countDocuments({
          teacherId: req.user.id,
          classId: c.classId,
          divisionName: c.divisionName,
          status: 'Conducted',
          isActive: true,
        });

        return {
          ...c,
          totalStudents: studentCount,
          totalLectures,
          conducted,
          pending: totalLectures - conducted,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: {
        classes: classesWithStats,
        totalClasses: classes.length,
        totalStudents: classesWithStats.reduce(
          (sum, c) => sum + c.totalStudents,
          0
        ),
      },
    });
  } catch (error) {
    console.error('🔥 TEACHER OVERVIEW ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class + Division of attendance report
// @route   GET /api/teacher-reports/class?classId=xxx&division=A&month=2026-10
// ============================================
export const getClassAttendanceReport = async (req, res) => {
  try {
    const { classId, division, month, startDate, endDate, subjectId } = req.query;

    if (!classId || !division) {
      return res.status(400).json({
        success: false,
        message: 'Class and division are required',
      });
    }

    const { filter: dateFilter, error: dateError } = getDateFilter({
      startDate,
      endDate,
      month,
    });
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const students = await Student.find({
      classId,
      divisionName: division.toUpperCase(),
      isActive: true,
    }).sort({ rollNumber: 1 });

    if (students.length === 0) {
      return res.status(200).json({
        success: true,
        data: { students: [], summary: {}, subjectWise: [] },
      });
    }

    const attendance = await Attendance.find({
      studentId: { $in: students.map((s) => s._id) },
      classId,
      divisionName: division.toUpperCase(),
      ...dateFilter,
      ...(subjectId ? { subjectId } : {}),
    }).populate('subjectId', 'name code');

    const studentReports = students.map((s) => {
      const studentAtt = attendance.filter(
        (a) => a.studentId.toString() === s._id.toString()
      );
      const total = studentAtt.length;
      const present = studentAtt.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;
      const absent = studentAtt.filter((a) => a.status === 'Absent').length;
      const late = studentAtt.filter((a) => a.status === 'Late').length;
      const excused = studentAtt.filter((a) => a.status === 'Excused').length;

      return {
        _id: s._id,
        name: s.name,
        rollNumber: s.rollNumber,
        seatNumber: s.seatNumber,
        prnNumber: s.prnNumber,
        total,
        present,
        absent,
        late,
        excused,
        percentage: total > 0 ? ((present / total) * 100).toFixed(2) : 0,
      };
    });

    const subjectMap = {};
    attendance.forEach((a) => {
      const subjId = a.subjectId?._id?.toString();
      if (!subjId) return;
      if (!subjectMap[subjId]) {
        subjectMap[subjId] = {
          subjectId: subjId,
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

    const totalRecords = attendance.length;
    const totalPresent = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;

    const summary = {
      totalStudents: students.length,
      totalRecords,
      totalPresent,
      totalAbsent: totalRecords - totalPresent,
      classAverage:
        totalRecords > 0
          ? ((totalPresent / totalRecords) * 100).toFixed(2)
          : 0,
      defaulters: studentReports.filter((s) => s.percentage < 75).length,
    };

    res.status(200).json({
      success: true,
      data: { students: studentReports, subjectWise, summary },
    });
  } catch (error) {
    console.error('🔥 CLASS REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    one student of complete report
// @route   GET /api/teacher-reports/student/:studentId
// ============================================
export const getStudentReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { month, startDate, endDate, subjectId } = req.query;

    const student = await Student.findById(studentId)
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const { filter: dateFilter, error: dateError } = getDateFilter({
      startDate,
      endDate,
      month,
    });
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    const attendance = await Attendance.find({
      studentId,
      ...dateFilter,
      ...(subjectId ? { subjectId } : {}),
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
        student,
        attendance,
        summary: {
          total,
          present,
          absent,
          late,
          excused,
          percentage: total > 0 ? ((present / total) * 100).toFixed(2) : 0,
          status: present / total >= 0.75 ? 'Eligible' : 'Defaulter',
        },
        subjectWise,
      },
    });
  } catch (error) {
    console.error('🔥 STUDENT REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};