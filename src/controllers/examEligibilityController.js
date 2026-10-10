import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';

// @desc    Get exam eligibility for a class
// @route   GET /api/exam-eligibility/class
//          ?classId=xxx&division=A&academicYear=2026-27&minAttendance=75
export const getClassEligibility = async (req, res) => {
  try {
    const { classId, division, academicYear, minAttendance = 75 } = req.query;

    if (!classId || !division) {
      return res.status(400).json({
        success: false,
        message: 'Class आणि Division आवश्यक',
      });
    }

    const divUpper = division.toUpperCase();
    const min = parseFloat(minAttendance);

    // Class info
    const cls = await Class.findById(classId)
      .populate('schoolId', 'name code');

    if (!cls) {
      return res.status(404).json({ success: false, message: 'Class नाही' });
    }

    // Students
    const students = await Student.find({
      classId,
      divisionName: divUpper,
      isActive: true,
      ...(academicYear && { academicYear }),
    }).sort({ rollNumber: 1 });

    // Subjects
    const subjects = await Subject.find({
      classId,
      isActive: true,
    });

    // Calculate eligibility for each student
    const studentReports = await Promise.all(
      students.map(async (s) => {
        const total = await Attendance.countDocuments({
          studentId: s._id,
        });
        const present = await Attendance.countDocuments({
          studentId: s._id,
          status: { $in: ['Present', 'Late'] },
        });

        const percentage =
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0;
        const isEligible = percentage >= min;

        // Subject-wise
        const subjectWise = await Promise.all(
          subjects.map(async (subj) => {
            const subjTotal = await Attendance.countDocuments({
              studentId: s._id,
              subjectId: subj._id,
            });
            const subjPresent = await Attendance.countDocuments({
              studentId: s._id,
              subjectId: subj._id,
              status: { $in: ['Present', 'Late'] },
            });
            return {
              subjectName: subj.name,
              subjectCode: subj.code,
              total: subjTotal,
              present: subjPresent,
              percentage:
                subjTotal > 0
                  ? parseFloat(((subjPresent / subjTotal) * 100).toFixed(2))
                  : 0,
            };
          })
        );

        return {
          _id: s._id,
          rollNumber: s.rollNumber,
          name: s.name,
          prnNumber: s.prnNumber,
          studentId: s.studentId,
          total,
          present,
          absent: total - present,
          percentage,
          isEligible,
          status: isEligible ? 'Eligible' : 'Detained',
          shortfall: isEligible ? 0 : (min - percentage).toFixed(2),
          subjectWise,
        };
      })
    );

    // Summary
    const total = studentReports.length;
    const eligible = studentReports.filter((s) => s.isEligible).length;
    const detained = total - eligible;

    res.status(200).json({
      success: true,
      data: {
        classInfo: {
          className: cls.name,
          academicYear: cls.academicYear || academicYear,
          schoolName: cls.schoolId?.name,
          divisionName: divUpper,
        },
        minAttendance: min,
        students: studentReports,
        summary: {
          totalStudents: total,
          eligible,
          detained,
          eligiblePercent: total > 0 ? ((eligible / total) * 100).toFixed(1) : 0,
        },
      },
    });
  } catch (error) {
    console.error('🔥 EXAM ELIGIBILITY ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all classes eligibility summary (admin)
// @route   GET /api/exam-eligibility/all
export const getAllEligibility = async (req, res) => {
  try {
    const { minAttendance = 75 } = req.query;
    const min = parseFloat(minAttendance);

    const classes = await Class.find({ isActive: true })
      .populate('schoolId', 'name code');

    const result = [];

    for (const cls of classes) {
      for (const div of cls.divisions || []) {
        const students = await Student.find({
          classId: cls._id,
          divisionName: div.name,
          isActive: true,
        });

        if (students.length === 0) continue;

        let eligible = 0;
        let detained = 0;

        for (const s of students) {
          const total = await Attendance.countDocuments({ studentId: s._id });
          if (total === 0) continue;
          const present = await Attendance.countDocuments({
            studentId: s._id,
            status: { $in: ['Present', 'Late'] },
          });
          const pct = (present / total) * 100;
          if (pct >= min) eligible++;
          else detained++;
        }

        result.push({
          classId: cls._id,
          className: cls.name,
          academicYear: cls.academicYear,
          divisionName: div.name,
          schoolName: cls.schoolId?.name,
          totalStudents: students.length,
          eligible,
          detained,
          eligiblePercent:
            students.length > 0
              ? ((eligible / students.length) * 100).toFixed(1)
              : 0,
        });
      }
    }

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};