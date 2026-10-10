import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';

// ============================================
// @desc    3-Row Matrix Report (NAAC Format)
// @route   GET /api/matrix-report/class
//          ?classId=xxx&division=A&subjectId=xxx&month=2026-10
// ============================================
export const getMatrixReport = async (req, res) => {
  try {
    const { classId, division, subjectId, month } = req.query;

    if (!classId || !division || !month) {
      return res.status(400).json({
        success: false,
        message: 'Class, Division आणि Month आवश्यक',
      });
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59);
    const divUpper = division.toUpperCase();

    // Class info
    const cls = await Class.findById(classId).populate('schoolId', 'name code');

    if (!cls) {
      return res.status(404).json({
        success: false,
        message: 'Class सापडली नाही',
      });
    }

    // Subject info (optional)
    let subjectInfo = null;
    if (subjectId) {
      subjectInfo = await Subject.findById(subjectId);
    }

    // Students
    const students = await Student.find({
      classId,
      divisionName: divUpper,
      isActive: true,
    }).sort({ rollNumber: 1 });

    // Lectures for the month
    const lectureFilter = {
      classId,
      divisionName: divUpper,
      date: { $gte: startDate, $lte: endDate },
      isActive: true,
    };
    if (subjectId) lectureFilter.subjectId = subjectId;

    const lectures = await Lecture.find(lectureFilter)
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name teacherId')
      .sort({ date: 1, startTime: 1 });

    // Attendance records
    const lectureIds = lectures.map((l) => l._id);
    const attendance = await Attendance.find({
      lectureId: { $in: lectureIds },
    });

    // Build columns — unique date + time slots
    const columnMap = {};

    lectures.forEach((l) => {
      const dateStr = new Date(l.date).toISOString().split('T')[0];
      const key = `${dateStr}|${l.startTime}|${l.endTime}`;

      if (!columnMap[key]) {
        columnMap[key] = {
          date: dateStr,
          day: new Date(l.date).toLocaleDateString('en-IN', {
            weekday: 'short',
          }),
          dayFull: new Date(l.date).toLocaleDateString('en-IN', {
            weekday: 'long',
          }),
          dateDisplay: new Date(l.date).getDate(),
          monthDisplay: new Date(l.date).toLocaleDateString('en-IN', {
            month: 'short',
          }),
          timeSlot: `${l.startTime}-${l.endTime}`,
          subjectCode: l.subjectId?.code || '',
          lectureId: l._id,
        };
      }
    });

    // Sort columns by date
    const columns = Object.values(columnMap).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.timeSlot.localeCompare(b.timeSlot);
    });

    // Build student rows
    const rows = students.map((s) => {
      const cells = columns.map((col) => {
        // Find this student's attendance for this lecture
        const record = attendance.find(
          (a) =>
            a.studentId.toString() === s._id.toString() &&
            a.lectureId.toString() === col.lectureId.toString()
        );

        if (!record) {
          return {
            status: '-',
            label: '-',
            percentage: null,
          };
        }

        const statusMap = {
          Present: { status: 'P', label: 'Present', percentage: 100 },
          Absent: { status: 'A', label: 'Absent', percentage: 0 },
          Late: { status: 'L', label: 'Late', percentage: 100 },
          Excused: { status: 'E', label: 'Excused', percentage: 100 },
        };

        return (
          statusMap[record.status] || {
            status: '?',
            label: 'Unknown',
            percentage: null,
          }
        );
      });

      // Calculate totals
      const presentCount = cells.filter(
        (c) => c.status === 'P' || c.status === 'L'
      ).length;
      const absentCount = cells.filter((c) => c.status === 'A').length;
      const totalMarked = cells.filter((c) => c.status !== '-').length;
      const percentage =
        totalMarked > 0
          ? parseFloat(((presentCount / totalMarked) * 100).toFixed(2))
          : 0;

      return {
        studentId: s._id,
        rollNumber: s.rollNumber,
        name: s.name,
        prnNumber: s.prnNumber,
        studentCode: s.studentId,
        cells,
        presentCount,
        absentCount,
        totalMarked,
        percentage,
        status: percentage >= 75 ? 'Eligible' : 'Defaulter',
      };
    });

    res.status(200).json({
      success: true,
      data: {
        classInfo: {
          classId: cls._id,
          className: cls.name,
          academicYear: cls.academicYear,
          schoolName: cls.schoolId?.name,
          schoolCode: cls.schoolId?.code,
          divisionName: divUpper,
        },
        subjectInfo: subjectInfo
          ? {
              _id: subjectInfo._id,
              name: subjectInfo.name,
              code: subjectInfo.code,
              type: subjectInfo.type,
            }
          : null,
        month,
        monthDisplay: startDate.toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        }),
        columns,
        rows,
        summary: {
          totalStudents: students.length,
          totalLectures: columns.length,
          classAverage:
            rows.length > 0
              ? parseFloat(
                  (
                    rows.reduce((sum, r) => sum + r.percentage, 0) / rows.length
                  ).toFixed(2)
                )
              : 0,
          defaulters: rows.filter((r) => r.percentage < 75).length,
        },
      },
    });
  } catch (error) {
    console.error('🔥 MATRIX REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};