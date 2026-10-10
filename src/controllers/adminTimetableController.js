import Timetable from '../models/Timetable.js';
import Class from '../models/Class.js';
import User from '../models/User.js';
import School from '../models/School.js';

// ============================================
// @desc    सगळ्या classes ची list (timetable साठी)
// @route   GET /api/admin-timetable/classes
// ============================================
export const getClassesForTimetable = async (req, res) => {
  try {
    const classes = await Class.find({ isActive: true })
      .populate('schoolId', 'name code')
      .populate('divisions.classTeacherId', 'name teacherId')
      .sort({ name: 1 });

    const result = [];

    for (const cls of classes) {
      for (const div of cls.divisions || []) {
        // प्रत्येक class+division चे lecture count
        const lectureCount = await Timetable.countDocuments({
          classId: cls._id,
          divisionName: div.name,
          isActive: true,
        });

        // Unique teachers
        const teachers = await Timetable.distinct('teacherId', {
          classId: cls._id,
          divisionName: div.name,
          isActive: true,
        });

        result.push({
          classId: cls._id,
          className: cls.name,
          academicYear: cls.academicYear,
          schoolId: cls.schoolId?._id,
          schoolName: cls.schoolId?.name,
          schoolCode: cls.schoolId?.code,
          divisionName: div.name,
          classTeacherId: div.classTeacherId?._id,
          classTeacherName: div.classTeacherId?.name || 'Not assigned',
          classTeacherCode: div.classTeacherId?.teacherId || '',
          totalLectures: lectureCount,
          totalTeachers: teachers.length,
        });
      }
    }

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error('🔥 ADMIN TIMETABLE CLASSES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class-wise full timetable
// @route   GET /api/admin-timetable/class/:classId/:division
// ============================================
export const getClassTimetableForAdmin = async (req, res) => {
  try {
    const { classId, division } = req.params;

    const timetables = await Timetable.find({
      classId,
      divisionName: division.toUpperCase(),
      isActive: true,
    })
      .populate('teacherId', 'name teacherId email phone')
      .populate('subjectId', 'name code type credits')
      .populate('schoolId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ dayOfWeek: 1, startTime: 1 });

    // Class info
    const cls = await Class.findById(classId)
      .populate('schoolId', 'name code')
      .populate('divisions.classTeacherId', 'name teacherId');

    const divisionData = cls?.divisions?.find(
      (d) => d.name === division.toUpperCase()
    );

    res.status(200).json({
      success: true,
      data: {
        classInfo: {
          classId: cls?._id,
          className: cls?.name,
          academicYear: cls?.academicYear,
          schoolName: cls?.schoolId?.name,
          schoolCode: cls?.schoolId?.code,
          divisionName: division.toUpperCase(),
          classTeacherName: divisionData?.classTeacherId?.name || 'Not assigned',
          classTeacherCode: divisionData?.classTeacherId?.teacherId || '',
        },
        timetables,
      },
    });
  } catch (error) {
    console.error('🔥 CLASS TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher-wise timetable list
// @route   GET /api/admin-timetable/class-teachers
// ============================================
export const getClassTeachersList = async (req, res) => {
  try {
    // सगळ्या Class Teachers शोध
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      'assignments.role': 'ClassTeacher',
    })
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .sort({ name: 1 });

    const result = [];

    for (const teacher of teachers) {
      const classTeacherAssignments = (teacher.assignments || []).filter(
        (a) => a.role === 'ClassTeacher'
      );

      for (const assignment of classTeacherAssignments) {
        const classId = assignment.classId?._id;
        const divisionName = assignment.divisionName;

        if (!classId || !divisionName) continue;

        // Lecture count
        const lectureCount = await Timetable.countDocuments({
          classId,
          divisionName,
          isActive: true,
        });

        // Subject count
        const subjects = await Timetable.distinct('subjectId', {
          classId,
          divisionName,
          isActive: true,
        });

        // Unique teachers
        const uniqueTeachers = await Timetable.distinct('teacherId', {
          classId,
          divisionName,
          isActive: true,
        });

        result.push({
          teacherId: teacher._id,
          teacherName: teacher.name,
          teacherCode: teacher.teacherId,
          teacherEmail: teacher.email,
          teacherPhone: teacher.phone,
          classId,
          className: assignment.classId?.name,
          academicYear: assignment.classId?.academicYear,
          divisionName,
          schoolId: assignment.schoolId?._id,
          schoolName: assignment.schoolId?.name,
          schoolCode: assignment.schoolId?.code,
          totalLectures: lectureCount,
          totalSubjects: subjects.length,
          totalTeachers: uniqueTeachers.length,
        });
      }
    }

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error('🔥 CLASS TEACHERS LIST ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher-wise full timetable (all classes)
// @route   GET /api/admin-timetable/teacher/:teacherId
// ============================================
export const getTeacherTimetableForAdmin = async (req, res) => {
  try {
    const { teacherId } = req.params;

    const teacher = await User.findById(teacherId)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    const timetables = await Timetable.find({
      teacherId,
      isActive: true,
    })
      .populate('teacherId', 'name teacherId email phone')
      .populate('subjectId', 'name code type')
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.status(200).json({
      success: true,
      data: {
        teacherInfo: {
          teacherId: teacher._id,
          name: teacher.name,
          teacherCode: teacher.teacherId,
          email: teacher.email,
          phone: teacher.phone,
          assignments: teacher.assignments,
        },
        timetables,
      },
    });
  } catch (error) {
    console.error('🔥 TEACHER TIMETABLE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    सगळ्या teachers ची list (timetable साठी)
// @route   GET /api/admin-timetable/teachers
// ============================================
export const getTeachersForTimetable = async (req, res) => {
  try {
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
    })
      .select('name teacherId email phone assignments')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code')
      .sort({ name: 1 });

    const result = await Promise.all(
      teachers.map(async (t) => {
        const lectureCount = await Timetable.countDocuments({
          teacherId: t._id,
          isActive: true,
        });

        const uniqueClasses = await Timetable.distinct('classId', {
          teacherId: t._id,
          isActive: true,
        });

        return {
          _id: t._id,
          name: t.name,
          teacherId: t.teacherId,
          email: t.email,
          phone: t.phone,
          totalAssignments: t.assignments?.length || 0,
          totalLectures: lectureCount,
          totalClasses: uniqueClasses.length,
          classTeacherOf:
            t.assignments
              ?.filter((a) => a.role === 'ClassTeacher')
              .map((a) => ({
                className: a.classId?.name,
                divisionName: a.divisionName,
                schoolName: a.schoolId?.name,
              })) || [],
        };
      })
    );

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error('🔥 TEACHERS LIST ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};