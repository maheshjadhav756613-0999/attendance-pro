import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import User from '../models/User.js';

// ============================================
// HELPER: Teacher this this class+division of Class Teacher is whether?
// ============================================
const isTeacherClassTeacher = (teacher, classId, divisionName) => {
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
// @desc    Class of Monthly Full Report
//          (all Students × all Subjects)
// @route   GET /api/monthly-report/class
//          ?classId=xxx&division=A&month=2026-10
// ============================================
export const getClassMonthlyReport = async (req, res) => {
  try {
    const { classId, division, month } = req.query;

    // ✅ Validation
    if (!classId || !division || !month) {
      return res.status(400).json({
        success: false,
        message: 'Class, division, and month is required',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);
    const divUpper = division.toUpperCase();

    // ✅ CLASS TEACHER ACCESS CHECK (only Teacher for)
    if (req.user.role === 'teacher') {
      const teacher = await User.findById(req.user.id);

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: 'Teacher not found',
        });
      }

      const isCT = isTeacherClassTeacher(teacher, classId, divUpper);

      if (!isCT) {
        return res.status(403).json({
          success: false,
          message:
            '⛔ this your Class Teacher class not. only own class of report view can.',
        });
      }
    }

    // ✅ Class info
    const cls = await Class.findById(classId).populate(
      'schoolId',
      'name code'
    );

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class not found',
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
            divisionName: divUpper,
            academicYear: cls.academicYear,
            school: cls.schoolId?.name,
          },
          month,
          subjects: [],
          students: [],
          subjectSummary: [],
          teacherSummary: [],
          summary: {
            totalStudents: 0,
            totalSubjects: 0,
            totalLectures: 0,
            classAverage: 0,
            defaulters: 0,
            eligible: 0,
          },
        },
      });
    }

    // ✅ this class+division of all subjects
    const subjects = await Subject.find({
      classId,
      isActive: true,
    }).sort({ name: 1 });

    // ✅ this in the month all lectures
    const lectures = await Lecture.find({
      classId,
      divisionName: divUpper,
      date: { $gte: startDate, $lte: endDate },
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name teacherId')
      .sort({ date: 1, startTime: 1 });

    // ✅ all lectures of attendance
    const lectureIds = lectures.map((l) => l._id);
    const attendanceRecords = await Attendance.find({
      lectureId: { $in: lectureIds },
    });

    // ============================================
    // Student-wise × Subject-wise Matrix
    // ============================================
    const studentReports = students.map((s) => {
      const subjectData = {};
      let totalPresent = 0;
      let totalLectures = 0;

      subjects.forEach((subj) => {
        const subjectLectures = lectures.filter(
          (l) => l.subjectId?._id?.toString() === subj._id.toString()
        );
        const subjectLectureIds = subjectLectures.map((l) =>
          l._id.toString()
        );

        const studentAttendance = attendanceRecords.filter(
          (a) =>
            a.studentId.toString() === s._id.toString() &&
            subjectLectureIds.includes(a.lectureId.toString())
        );

        const present = studentAttendance.filter(
          (a) => a.status === 'Present' || a.status === 'Late'
        ).length;
        const total = subjectLectures.length;
        const percentage =
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

        subjectData[subj.code] = {
          subjectId: subj._id,
          name: subj.name,
          code: subj.code,
          present,
          total,
          percentage,
        };

        totalPresent += present;
        totalLectures += total;
      });

      const overallPercentage =
        totalLectures > 0
          ? parseFloat(((totalPresent / totalLectures) * 100).toFixed(2))
          : 0;

      return {
        _id: s._id,
        rollNumber: s.rollNumber,
        name: s.name,
        prnNumber: s.prnNumber,
        studentId: s.studentId,
        gender: s.gender,
        category: s.category,
        subjects: subjectData,
        totalPresent,
        totalLectures,
        totalAbsent: totalLectures - totalPresent,
        overallPercentage,
        status: overallPercentage >= 75 ? 'Eligible' : 'Defaulter',
      };
    });

    // ============================================
    // Class Summary
    // ============================================
    const classTotalLectures = studentReports[0]?.totalLectures || 0;
    const classTotalPresent = studentReports.reduce(
      (sum, s) => sum + s.totalPresent,
      0
    );
    const classPossible = studentReports.length * classTotalLectures;
    const classAverage =
      classPossible > 0
        ? parseFloat(((classTotalPresent / classPossible) * 100).toFixed(2))
        : 0;

    const defaulters = studentReports.filter(
      (s) => s.overallPercentage < 75
    ).length;

    // ============================================
    // Subject-wise Summary
    // ============================================
    const subjectSummary = subjects.map((subj) => {
      const subjLectures = lectures.filter(
        (l) => l.subjectId?._id?.toString() === subj._id.toString()
      );
      const subjLectureIds = subjLectures.map((l) => l._id.toString());

      const subjAttendance = attendanceRecords.filter((a) =>
        subjLectureIds.includes(a.lectureId.toString())
      );

      const present = subjAttendance.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;
      const total = subjAttendance.length;
      const percentage =
        total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

      const teachers = [
        ...new Set(
          subjLectures.map((l) => l.teacherId?.name).filter(Boolean)
        ),
      ];

      return {
        _id: subj._id,
        name: subj.name,
        code: subj.code,
        type: subj.type,
        credits: subj.credits,
        totalLectures: subjLectures.length,
        conductedLectures: subjLectures.filter(
          (l) => l.status === 'Conducted'
        ).length,
        presentRecords: present,
        totalRecords: total,
        percentage,
        teachers,
      };
    });

    // ============================================
    // Teacher-wise Summary
    // ============================================
    const teacherMap = {};

    lectures.forEach((l) => {
      const tId = l.teacherId?._id?.toString();
      if (!tId) return;

      if (!teacherMap[tId]) {
        teacherMap[tId] = {
          teacherId: tId,
          name: l.teacherId.name,
          teacherCode: l.teacherId.teacherId,
          totalLectures: 0,
          conducted: 0,
          scheduled: 0,
          cancelled: 0,
          subjects: new Set(),
        };
      }

      teacherMap[tId].totalLectures++;

      if (l.status === 'Conducted') teacherMap[tId].conducted++;
      else if (l.status === 'Cancelled') teacherMap[tId].cancelled++;
      else teacherMap[tId].scheduled++;

      if (l.subjectId?.name) {
        teacherMap[tId].subjects.add(l.subjectId.name);
      }
    });

    const teacherSummary = Object.values(teacherMap).map((t) => ({
      ...t,
      subjects: Array.from(t.subjects),
      attendancePercentage:
        t.totalLectures > 0
          ? parseFloat(((t.conducted / t.totalLectures) * 100).toFixed(2))
          : 0,
    }));

    // ✅ Response
    res.status(200).json({
      success: true,
      data: {
        classInfo: {
          className: cls.name,
          divisionName: divUpper,
          academicYear: cls.academicYear,
          school: cls.schoolId?.name,
        },
        month,
        subjects: subjects.map((s) => ({
          _id: s._id,
          name: s.name,
          code: s.code,
          type: s.type,
          credits: s.credits,
        })),
        students: studentReports,
        subjectSummary,
        teacherSummary,
        summary: {
          totalStudents: students.length,
          totalSubjects: subjects.length,
          totalLectures: classTotalLectures,
          classAverage,
          defaulters,
          eligible: students.length - defaulters,
        },
      },
    });
  } catch (error) {
    console.error('🔥 MONTHLY REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Weekly Breakdown (weekly attendance)
// @route   GET /api/monthly-report/weekly
//          ?classId=xxx&division=A&month=2026-10
// ============================================
export const getWeeklyBreakdown = async (req, res) => {
  try {
    const { classId, division, month } = req.query;

    if (!classId || !division || !month) {
      return res.status(400).json({
        success: false,
        message: 'Class, division, and month required',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const divUpper = division.toUpperCase();

    // ✅ CLASS TEACHER ACCESS CHECK
    if (req.user.role === 'teacher') {
      const teacher = await User.findById(req.user.id);

      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: 'Teacher not found',
        });
      }

      const isCT = isTeacherClassTeacher(teacher, classId, divUpper);

      if (!isCT) {
        return res.status(403).json({
          success: false,
          message:
            '⛔ this your Class Teacher class not. only own class of report view can.',
        });
      }
    }

    // ✅ Students
    const students = await Student.find({
      classId,
      divisionName: divUpper,
      isActive: true,
    }).select('_id name rollNumber');

    const studentIds = students.map((s) => s._id);

    // ✅ Month of weeks
    const weeks = [];
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);

    let weekStart = new Date(monthStart);
    let weekNum = 1;

    while (weekStart <= monthEnd) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      if (weekEnd > monthEnd) {
        weekEnd.setTime(monthEnd.getTime());
      }
      weekEnd.setHours(23, 59, 59, 999);

      const weekAttendance = await Attendance.find({
        studentId: { $in: studentIds },
        date: { $gte: weekStart, $lte: weekEnd },
      });

      const total = weekAttendance.length;
      const present = weekAttendance.filter(
        (a) => a.status === 'Present' || a.status === 'Late'
      ).length;
      const percentage =
        total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;

      weeks.push({
        weekNumber: weekNum,
        label: `Week ${weekNum}`,
        from: weekStart.toISOString().split('T')[0],
        to: weekEnd.toISOString().split('T')[0],
        totalRecords: total,
        present,
        absent: total - present,
        percentage,
      });

      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() + 1);
      weekStart.setHours(0, 0, 0, 0);
      weekNum++;

      if (weekNum > 6) break;
    }

    res.status(200).json({
      success: true,
      data: weeks,
    });
  } catch (error) {
    console.error('🔥 WEEKLY BREAKDOWN ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};