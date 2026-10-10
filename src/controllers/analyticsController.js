
import Attendance from '../models/Attendance.js';
import Student from '../models/Student.js';
import Lecture from '../models/Lecture.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';

// ============================================
// @desc    NAAC Overview Stats
// @route   GET /api/analytics/naac-overview
// ============================================
export const getNaacOverview = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const filter = { isActive: true };
    if (academicYear) filter.academicYear = academicYear;

    const totalStudents = await Student.countDocuments(filter);

    // Gender-wise
    const genderWise = await Student.aggregate([
      { $match: filter },
      { $group: { _id: '$gender', count: { $sum: 1 } } },
    ]);

    // Category-wise
    const categoryWise = await Student.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    // Programme-wise
    const programmeWise = await Student.aggregate([
      { $match: filter },
      { $group: { _id: '$programme', count: { $sum: 1 } } },
    ]);

    // Overall attendance
    const totalAttendance = await Attendance.countDocuments();
    const totalPresent = await Attendance.countDocuments({
      status: { $in: ['Present', 'Late'] },
    });
    const overallPercentage =
      totalAttendance > 0
        ? parseFloat(((totalPresent / totalAttendance) * 100).toFixed(2))
        : 0;

    // Defaulter count
    const students = await Student.find(filter);
    let defaulterCount = 0;
    let eligibleCount = 0;

    for (const s of students) {
      const total = await Attendance.countDocuments({ studentId: s._id });
      if (total === 0) continue;
      const present = await Attendance.countDocuments({
        studentId: s._id,
        status: { $in: ['Present', 'Late'] },
      });
      const pct = (present / total) * 100;
      if (pct < 75) defaulterCount++;
      else eligibleCount++;
    }

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        genderWise,
        categoryWise,
        programmeWise,
        overallPercentage,
        defaulterCount,
        eligibleCount,
        totalAttendance,
        totalPresent,
      },
    });
  } catch (error) {
    console.error('🔥 NAAC OVERVIEW ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Monthly Trend
// @route   GET /api/analytics/monthly-trend
// ============================================
export const getMonthlyTrend = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const students = await Student.find({
      isActive: true,
      ...(academicYear && { academicYear }),
    }).select('_id');

    const studentIds = students.map((s) => s._id);

    const monthly = await Attendance.aggregate([
      { $match: { studentId: { $in: studentIds } } },
      {
        $group: {
          _id: { $month: '$date' },
          total: { $sum: 1 },
          present: {
            $sum: {
              $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const data = monthNames.map((name, i) => {
      const m = monthly.find((x) => x._id === i + 1);
      return {
        month: name,
        percentage: m
          ? parseFloat(((m.present / m.total) * 100).toFixed(2))
          : 0,
        total: m?.total || 0,
        present: m?.present || 0,
      };
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('🔥 MONTHLY TREND ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Programme-wise
// @route   GET /api/analytics/programme-wise
// ============================================
export const getProgrammeWise = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const programmes = await Student.distinct('programme', {
      isActive: true,
      programme: { $ne: null, $ne: '' },
    });

    const data = [];

    for (const prog of programmes) {
      if (!prog) continue;

      const students = await Student.find({
        programme: prog,
        isActive: true,
        ...(academicYear && { academicYear }),
      }).select('_id');

      const studentIds = students.map((s) => s._id);

      const total = await Attendance.countDocuments({
        studentId: { $in: studentIds },
      });
      const present = await Attendance.countDocuments({
        studentId: { $in: studentIds },
        status: { $in: ['Present', 'Late'] },
      });

      data.push({
        programme: prog,
        students: students.length,
        percentage:
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
        total,
        present,
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('🔥 PROGRAMME WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class-wise
// @route   GET /api/analytics/class-wise
// ============================================
export const getClassWise = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const classes = await Class.find({ isActive: true }).populate(
      'schoolId',
      'name'
    );

    const data = [];

    for (const cls of classes) {
      for (const div of cls.divisions || []) {
        const students = await Student.find({
          classId: cls._id,
          divisionName: div.name,
          isActive: true,
          ...(academicYear && { academicYear }),
        }).select('_id');

        if (students.length === 0) continue;

        const studentIds = students.map((s) => s._id);

        const total = await Attendance.countDocuments({
          studentId: { $in: studentIds },
        });
        const present = await Attendance.countDocuments({
          studentId: { $in: studentIds },
          status: { $in: ['Present', 'Late'] },
        });

        data.push({
          className: `${cls.name}-${div.name}`,
          fullName: `${cls.name} - Division ${div.name}`,
          school: cls.schoolId?.name || '',
          students: students.length,
          percentage:
            total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
          total,
          present,
        });
      }
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('🔥 CLASS WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Gender-wise
// @route   GET /api/analytics/gender-wise
// ============================================
export const getGenderWise = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const data = await Student.aggregate([
      {
        $match: {
          isActive: true,
          ...(academicYear && { academicYear }),
        },
      },
      {
        $group: {
          _id: '$gender',
          count: { $sum: 1 },
        },
      },
    ]);

    const result = [];

    for (const item of data) {
      const students = await Student.find({
        gender: item._id,
        isActive: true,
      }).select('_id');

      const studentIds = students.map((s) => s._id);
      const total = await Attendance.countDocuments({
        studentId: { $in: studentIds },
      });
      const present = await Attendance.countDocuments({
        studentId: { $in: studentIds },
        status: { $in: ['Present', 'Late'] },
      });

      result.push({
        gender: item._id || 'Not Specified',
        students: item.count,
        percentage:
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('🔥 GENDER WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Category-wise (SC/ST/OBC)
// @route   GET /api/analytics/category-wise
// ============================================
export const getCategoryWise = async (req, res) => {
  try {
    const { academicYear } = req.query;

    const categories = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'];
    const result = [];

    for (const cat of categories) {
      const students = await Student.find({
        category: cat,
        isActive: true,
        ...(academicYear && { academicYear }),
      }).select('_id');

      if (students.length === 0) continue;

      const studentIds = students.map((s) => s._id);
      const total = await Attendance.countDocuments({
        studentId: { $in: studentIds },
      });
      const present = await Attendance.countDocuments({
        studentId: { $in: studentIds },
        status: { $in: ['Present', 'Late'] },
      });

      result.push({
        category: cat,
        students: students.length,
        percentage:
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('🔥 CATEGORY WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject-wise
// @route   GET /api/analytics/subject-wise
// ============================================
export const getSubjectWise = async (req, res) => {
  try {
    const subjects = await Subject.find({ isActive: true }).populate(
      'classId',
      'name'
    );

    const data = [];

    for (const subj of subjects) {
      const lectures = await Lecture.find({
        subjectId: subj._id,
        status: 'Conducted',
      }).select('_id');

      const lectureIds = lectures.map((l) => l._id);

      const total = await Attendance.countDocuments({
        lectureId: { $in: lectureIds },
      });
      const present = await Attendance.countDocuments({
        lectureId: { $in: lectureIds },
        status: { $in: ['Present', 'Late'] },
      });

      data.push({
        subject: subj.name,
        code: subj.code,
        className: subj.classId?.name || '',
        percentage:
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
        total,
        present,
      });
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('🔥 SUBJECT WISE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Defaulters List
// @route   GET /api/analytics/defaulters
// ============================================
export const getDefaulters = async (req, res) => {
  try {
    const { academicYear, threshold = 75 } = req.query;

    const students = await Student.find({
      isActive: true,
      ...(academicYear && { academicYear }),
    })
      .populate('classId', 'name')
      .populate('schoolId', 'name');

    const defaulters = [];

    for (const s of students) {
      const total = await Attendance.countDocuments({ studentId: s._id });
      if (total === 0) continue;

      const present = await Attendance.countDocuments({
        studentId: s._id,
        status: { $in: ['Present', 'Late'] },
      });

      const percentage = (present / total) * 100;

      if (percentage < parseFloat(threshold)) {
        defaulters.push({
          _id: s._id,
          name: s.name,
          rollNumber: s.rollNumber,
          studentId: s.studentId,
          prnNumber: s.prnNumber,
          className: `${s.classId?.name}-${s.divisionName}`,
          school: s.schoolId?.name,
          category: s.category,
          gender: s.gender,
          mobile: s.mobile,
          total,
          present,
          absent: total - present,
          percentage: parseFloat(percentage.toFixed(2)),
        });
      }
    }

    defaulters.sort((a, b) => a.percentage - b.percentage);

    res.status(200).json({
      success: true,
      count: defaulters.length,
      data: defaulters,
    });
  } catch (error) {
    console.error('🔥 DEFAULTERS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Year Comparison
// @route   GET /api/analytics/year-comparison
// ============================================
export const getYearComparison = async (req, res) => {
  try {
    const years = await Student.distinct('academicYear', { isActive: true });

    const data = [];

    for (const year of years) {
      if (!year) continue;

      const students = await Student.find({
        academicYear: year,
        isActive: true,
      }).select('_id');

      const studentIds = students.map((s) => s._id);
      const total = await Attendance.countDocuments({
        studentId: { $in: studentIds },
      });
      const present = await Attendance.countDocuments({
        studentId: { $in: studentIds },
        status: { $in: ['Present', 'Late'] },
      });

      data.push({
        year,
        students: students.length,
        percentage:
          total > 0 ? parseFloat(((present / total) * 100).toFixed(2)) : 0,
      });
    }

    data.sort((a, b) => a.year.localeCompare(b.year));

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('🔥 YEAR COMPARISON ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};