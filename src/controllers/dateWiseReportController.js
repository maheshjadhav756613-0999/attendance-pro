import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import Subject from '../models/Subject.js';
import Parent from '../models/Parent.js';

// ============================================
// HELPER: Class Teacher आहे का?
// ============================================
const isClassTeacherOf = (teacher, classId, divisionName) => {
  if (!teacher || !teacher.assignments) return false;
  return teacher.assignments.some((a) => {
    const aClassId = (a.classId?._id || a.classId)?.toString();
    return (
      aClassId === classId?.toString() &&
      a.divisionName === divisionName?.toUpperCase() &&
      a.role === 'ClassTeacher'
    );
  });
};

// ============================================
// HELPER: Teacher या class+division ला assigned आहे का?
// ============================================
const isTeacherAssigned = (teacher, classId, divisionName) => {
  if (!teacher || !teacher.assignments) return false;
  return teacher.assignments.some((a) => {
    const aClassId = (a.classId?._id || a.classId)?.toString();
    return (
      aClassId === classId?.toString() &&
      a.divisionName === divisionName?.toUpperCase()
    );
  });
};

// ============================================
// @desc    Subjects visible to a teacher for a class division
// @route   GET /api/date-wise-report/subjects
// ============================================
export const getDateWiseReportSubjects = async (req, res) => {
  try {
    const { classId, division } = req.query;
    if (!classId || !division) {
      return res.status(400).json({
        success: false,
        message: 'Class ID आणि Division आवश्यक',
      });
    }

    const teacher = await User.findById(req.user.id);
    if (!teacher || teacher.role !== 'teacher') {
      return res.status(403).json({
        success: false,
        message: 'फक्त teacher हा report वापरू शकतो',
      });
    }

    const divisionName = String(division).toUpperCase();
    const assignments = (teacher.assignments || []).filter((assignment) => {
      const assignedClassId = (
        assignment.classId?._id || assignment.classId
      )?.toString();
      return (
        assignedClassId === String(classId) &&
        assignment.divisionName === divisionName
      );
    });

    if (assignments.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'तू या class आणि division ला assigned नाही',
      });
    }

    const isClassTeacher = assignments.some(
      (assignment) => assignment.role === 'ClassTeacher'
    );
    const filter = { classId, isActive: true };
    if (!isClassTeacher) {
      const subjectIds = assignments
        .map((assignment) => assignment.subjectId?._id || assignment.subjectId)
        .filter(Boolean);
      filter._id = { $in: subjectIds };
    }

    const subjects = await Subject.find(filter)
      .select('name code')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: subjects.length,
      data: subjects,
    });
  } catch (error) {
    console.error('🔥 DATE-WISE REPORT SUBJECTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Date-wise attendance matrix
//          (Students × Dates)
// @route   GET /api/date-wise-report
//          ?classId=xxx&division=A&from=2026-10-01&to=2026-10-31
//          &subjectId=xxx (optional)
// ============================================
export const getDateWiseReport = async (req, res) => {
  try {
    const { classId, division, from, to } = req.query;
    const rawSubjectId = req.query.subjectId;
    const subjectId =
      rawSubjectId && typeof rawSubjectId === 'object'
        ? rawSubjectId._id || rawSubjectId.id
        : rawSubjectId;

    // Validation
    if (!classId || !division || !from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Class, Division, From Date आणि To Date आवश्यक',
      });
    }

    const hasSubjectFilter =
      rawSubjectId !== undefined && rawSubjectId !== null && rawSubjectId !== '';
    if (
      hasSubjectFilter &&
      (!subjectId || !mongoose.isValidObjectId(subjectId))
    ) {
      return res.status(400).json({
        success: false,
        message: 'Subject ID चुकीचा आहे. Subject पुन्हा निवडून report generate करा.',
      });
    }

    const user = await User.findById(req.user.id);
    const divUpper = division.toUpperCase();

    // ✅ Access Control
    if (user.role === 'teacher') {
      const isAssigned = isTeacherAssigned(user, classId, divUpper);
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'तू या class+division ला assigned नाही',
        });
      }
    }

    // ✅ Date range तयार कर
    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    // ✅ Class info
    const cls = await Class.findById(classId)
      .populate('schoolId', 'name code')
      .populate('divisions.classTeacherId', 'name teacherId');

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class सापडली नाही',
      });
    }

    // ✅ Students fetch
    const students = await Student.find({
      classId,
      divisionName: divUpper,
      isActive: true,
    }).sort({ rollNumber: 1 });

    if (students.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          classInfo: {
            className: cls.name,
            academicYear: cls.academicYear,
            schoolName: cls.schoolId?.name,
            divisionName: divUpper,
            from,
            to,
          },
          dates: [],
          students: [],
          summary: {},
        },
      });
    }

    // ✅ Lectures fetch — या range मध्ये
    let lectureFilter = {
      classId,
      divisionName: divUpper,
      date: { $gte: startDate, $lte: endDate },
      isActive: true,
    };

    if (subjectId) {
      lectureFilter.subjectId = subjectId;
    }

    const lectures = await Lecture.find(lectureFilter)
      .populate('subjectId', 'name code')
      .sort({ date: 1, startTime: 1 });

    // ✅ सगळे dates — unique
    const dateSet = new Set();
    lectures.forEach((l) => {
      const dateStr = new Date(l.date).toISOString().split('T')[0];
      dateSet.add(dateStr);
    });
    const dates = Array.from(dateSet).sort();

    // ✅ सगळी attendance — एका query मध्ये
    const lectureIds = lectures.map((l) => l._id);
    const attendanceRecords = await Attendance.find({
      lectureId: { $in: lectureIds },
    });

    // ✅ Date-wise lecture count
    const lecturesPerDate = {};
    lectures.forEach((l) => {
      const dateStr = new Date(l.date).toISOString().split('T')[0];
      if (!lecturesPerDate[dateStr]) {
        lecturesPerDate[dateStr] = [];
      }
      lecturesPerDate[dateStr].push(l._id.toString());
    });

    // ✅ Student × Date matrix तयार कर
    const studentMatrix = students.map((s) => {
      const dateData = {};
      let totalPresent = 0;
      let totalLectures = 0;

      dates.forEach((date) => {
        const dateLectures = lecturesPerDate[date] || [];

        // या student ची attendance या date ला
        const studentAtt = attendanceRecords.filter(
          (a) =>
            a.studentId.toString() === s._id.toString() &&
            dateLectures.includes(a.lectureId.toString())
        );

        const present = studentAtt.filter(
          (a) => a.status === 'Present' || a.status === 'Late'
        ).length;
        const total = dateLectures.length;

        // Status decide
        let status = '-';
        if (total === 0) {
          status = 'no-lecture'; // ⚪ lecture नाही
        } else if (present === 0) {
          status = 'absent'; // 🔴 सगळे absent
        } else if (present === total) {
          status = 'present'; // 🟢 सगळे present
        } else {
          status = 'partial'; // 🟡 काही present
        }

        dateData[date] = {
          present,
          absent: total - present,
          total,
          status,
        };

        totalPresent += present;
        totalLectures += total;
      });

      const percentage =
        totalLectures > 0
          ? parseFloat(((totalPresent / totalLectures) * 100).toFixed(2))
          : 0;

      return {
        _id: s._id,
        name: s.name,
        rollNumber: s.rollNumber,
        prnNumber: s.prnNumber,
        seatNumber: s.seatNumber,
        studentId: s.studentId,
        gender: s.gender,
        category: s.category,
        dateData,
        totalPresent,
        totalAbsent: totalLectures - totalPresent,
        totalLectures,
        percentage,
        status: percentage >= 75 ? 'Eligible' : 'Defaulter',
      };
    });

    // ✅ Summary
    const classTotalPresent = studentMatrix.reduce(
      (sum, s) => sum + s.totalPresent,
      0
    );
    const classTotalLectures = studentMatrix.reduce(
      (sum, s) => sum + s.totalLectures,
      0
    );
    const classAverage =
      classTotalLectures > 0
        ? parseFloat(
            ((classTotalPresent / classTotalLectures) * 100).toFixed(2)
          )
        : 0;

    const summary = {
      totalStudents: students.length,
      totalDates: dates.length,
      totalLectures: lectures.length,
      classAverage,
      defaulters: studentMatrix.filter((s) => s.percentage < 75).length,
      eligible: studentMatrix.filter((s) => s.percentage >= 75).length,
    };

    res.status(200).json({
      success: true,
      data: {
        classInfo: {
          className: cls.name,
          academicYear: cls.academicYear,
          schoolName: cls.schoolId?.name,
          schoolCode: cls.schoolId?.code,
          divisionName: divUpper,
          from,
          to,
          subjectName: subjectId
            ? lectures[0]?.subjectId?.name
            : 'All Subjects',
        },
        dates,
        students: studentMatrix,
        summary,
      },
    });
  } catch (error) {
    console.error('🔥 DATE WISE REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एका student ची date-wise report
// @route   GET /api/date-wise-report/student/:studentId?from=xxx&to=xxx
// ============================================
export const getStudentDateWiseReport = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From आणि To date आवश्यक',
      });
    }

    const student = await Student.findById(studentId)
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    // ✅ Access control
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account सापडले नाही',
      });
    }

    // Student स्वतःच बघत असेल
    if (user.role === 'student') {
      const isLinkedStudent =
        student.userId?.toString() === req.user.id ||
        user.studentId?.toString() === student._id.toString();
      if (!isLinkedStudent) {
        return res.status(403).json({
          success: false,
          message: 'तू फक्त स्वतःची attendance बघू शकतोस',
        });
      }
    }

    // Parent — स्वतःच्या मुलाची
    if (user.role === 'parent') {
      const parentLink = await Parent.exists({
        userId: req.user.id,
        'children.studentId': student._id,
        isActive: true,
      });
      const isLinkedChild =
        student.parentUserId?.toString() === req.user.id ||
        user.studentId?.toString() === student._id.toString() ||
        Boolean(parentLink);
      if (!isLinkedChild) {
        return res.status(403).json({
          success: false,
          message: 'तू फक्त स्वतःच्या मुलाची attendance बघू शकतोस',
        });
      }
    }

    if (!['admin', 'student', 'parent', 'teacher'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'या report साठी account role परवानगी नाही',
      });
    }

    // Teacher — assigned class+division
    if (user.role === 'teacher') {
      const isAssigned = isTeacherAssigned(
        user,
        student.classId._id.toString(),
        student.divisionName
      );
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'तू या student चा teacher नाही',
        });
      }
    }

    const startDate = new Date(from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);

    // Lectures
    const lectures = await Lecture.find({
      classId: student.classId._id,
      divisionName: student.divisionName,
      date: { $gte: startDate, $lte: endDate },
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .sort({ date: 1 });

    const lectureIds = lectures.map((l) => l._id);

    // Attendance
    const attendanceRecords = await Attendance.find({
      studentId,
      lectureId: { $in: lectureIds },
    });

    // Date-wise
    const dates = [
      ...new Set(
        lectures.map((l) => new Date(l.date).toISOString().split('T')[0])
      ),
    ].sort();

    const dateWise = dates.map((date) => {
      const dateLectures = lectures.filter(
        (l) => new Date(l.date).toISOString().split('T')[0] === date
      );

      const lecturesWithStatus = dateLectures.map((l) => {
        const att = attendanceRecords.find(
          (a) => a.lectureId.toString() === l._id.toString()
        );
        return {
          lectureId: l._id,
          subject: l.subjectId?.name,
          subjectCode: l.subjectId?.code,
          startTime: l.startTime,
          endTime: l.endTime,
          status: att?.status || 'Not Marked',
        };
      });

      const present = lecturesWithStatus.filter(
        (l) => l.status === 'Present' || l.status === 'Late'
      ).length;
      const total = dateLectures.length;

      return {
        date,
        lectures: lecturesWithStatus,
        present,
        absent: total - present,
        total,
        status:
          total === 0
            ? 'no-lecture'
            : present === total
            ? 'present'
            : present === 0
            ? 'absent'
            : 'partial',
      };
    });

    // Summary
    const total = attendanceRecords.length;
    const present = attendanceRecords.filter(
      (a) => a.status === 'Present' || a.status === 'Late'
    ).length;

    res.status(200).json({
      success: true,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          prnNumber: student.prnNumber,
          className: student.classId?.name,
          divisionName: student.divisionName,
          schoolName: student.schoolId?.name,
        },
        dateWise,
        summary: {
          total,
          present,
          absent: total - present,
          percentage:
            total > 0 ? ((present / total) * 100).toFixed(2) : 0,
        },
        from,
        to,
      },
    });
  } catch (error) {
    console.error('🔥 STUDENT DATE WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};