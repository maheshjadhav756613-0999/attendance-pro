import User from '../models/User.js';
import School from '../models/School.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Holiday from '../models/Holiday.js';

// ============================================
// @desc    System overview stats
// @route   GET /api/reports/overview
// ============================================
export const getOverview = async (req, res) => {
  try {
    const [teachers, schools, classes, subjects, holidays] = await Promise.all([
      User.countDocuments({ role: 'teacher', isActive: true }),
      School.countDocuments({ isActive: true }),
      Class.countDocuments({ isActive: true }),
      Subject.countDocuments({ isActive: true }),
      Holiday.countDocuments({ isActive: true }),
    ]);

    const classList = await Class.find({ isActive: true });
    const totalDivisions = classList.reduce(
      (sum, c) => sum + (c.divisions?.length || 0),
      0
    );

    const teachersWithClassTeacher = await User.countDocuments({
      role: 'teacher',
      isActive: true,
      'assignments.role': 'ClassTeacher',
    });

    res.status(200).json({
      success: true,
      data: {
        totalTeachers: teachers,
        totalSchools: schools,
        totalClasses: classes,
        totalDivisions,
        totalSubjects: subjects,
        totalHolidays: holidays,
        classTeachers: teachersWithClassTeacher,
        subjectTeachers: teachers - teachersWithClassTeacher,
      },
    });
  } catch (error) {
    console.error('🔥 OVERVIEW ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher-wise report
// @route   GET /api/reports/teachers
// ============================================
export const getTeacherReport = async (req, res) => {
  try {
    const { schoolId } = req.query;

    const teachers = await User.find({ role: 'teacher', isActive: true })
      .select('name email teacherId phone assignments')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    const report = teachers.map((t) => {
      let assignments = t.assignments || [];

      if (schoolId) {
        assignments = assignments.filter(
          (a) => (a.schoolId?._id || a.schoolId) === schoolId
        );
      }

      const schoolSet = new Set();
      const classSet = new Set();
      const subjectSet = new Set();
      let classTeacherOf = [];
      let subjectTeacherOf = [];
      const assignmentDetails = assignments.map((a) => ({
        schoolId: (a.schoolId?._id || a.schoolId)?.toString() || '',
        schoolName: a.schoolId?.name || 'Unknown',
        classId: (a.classId?._id || a.classId)?.toString() || '',
        className: a.classId?.name || 'Unknown',
        divisionName: a.divisionName || '',
        subjectId: (a.subjectId?._id || a.subjectId)?.toString() || '',
        subjectName: a.subjectId?.name || '',
        role: a.role || '',
      }));

      assignments.forEach((a) => {
        if (a.schoolId) schoolSet.add(a.schoolId?.name || 'Unknown');
        if (a.classId) classSet.add(a.classId?.name || 'Unknown');
        if (a.subjectId) subjectSet.add(a.subjectId?.name || 'Unknown');

        if (a.role === 'ClassTeacher') {
          classTeacherOf.push(`${a.classId?.name}-${a.divisionName}`);
        } else if (a.subjectId) {
          subjectTeacherOf.push(
            `${a.classId?.name}-${a.divisionName} • ${a.subjectId?.name}`
          );
        }
      });

      return {
        _id: t._id,
        name: t.name,
        email: t.email,
        teacherId: t.teacherId,
        phone: t.phone,
        totalAssignments: assignments.length,
        schools: Array.from(schoolSet),
        classes: Array.from(classSet),
        subjects: Array.from(subjectSet),
        classTeacherOf,
        subjectTeacherOf,
        assignmentDetails,
      };
    });

    const filtered = schoolId
      ? report.filter((r) => r.totalAssignments > 0)
      : report;

    res.status(200).json({
      success: true,
      count: filtered.length,
      data: filtered,
    });
  } catch (error) {
    console.error('🔥 TEACHER REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class-wise report (school-wise filter)
// @route   GET /api/reports/classes?schoolId=xxx
// ============================================
export const getClassReport = async (req, res) => {
  try {
    const { schoolId } = req.query;

    // ✅ School filter
    const filter = {};
    if (schoolId) {
      filter.schoolId = schoolId;
    }

    const classes = await Class.find(filter)
      .populate('schoolId', 'name code')
      .populate('divisions.classTeacherId', 'name teacherId')
      .sort({ name: 1 });

    const report = await Promise.all(
      classes.map(async (c) => {
        // Subjects in this class
        const subjects = await Subject.find({
          classId: c._id,
          isActive: true,
        });

        // प्रत्येक division साठी Subject Teachers
        const divisionsWithTeachers = await Promise.all(
          (c.divisions || []).map(async (d) => {
            const subjectTeachers = await User.find({
              role: 'teacher',
              isActive: true,
              assignments: {
                $elemMatch: {
                  classId: c._id,
                  divisionName: d.name,
                  role: 'SubjectTeacher',
                },
              },
            })
              .select('name teacherId assignments')
              .populate('assignments.subjectId', 'name code');

            const subjectTeacherList = subjectTeachers.map((t) => {
              const relevantSubjects = (t.assignments || [])
                .filter(
                  (a) =>
                    (a.classId?._id || a.classId)?.toString() ===
                      c._id.toString() &&
                    a.divisionName === d.name &&
                    a.role === 'SubjectTeacher'
                )
                .map((a) => ({
                  name: a.subjectId?.name || '',
                  code: a.subjectId?.code || '',
                }))
                .filter((s) => s.name);

              return {
                teacherName: t.name,
                teacherId: t.teacherId,
                subjects: relevantSubjects,
              };
            });

            // Class Teacher
            let classTeacherName = 'Not assigned';
            let classTeacherCode = '';

            if (d.classTeacherId) {
              classTeacherName = d.classTeacherId.name || 'Not assigned';
              classTeacherCode = d.classTeacherId.teacherId || '';
            } else {
              const ctUser = await User.findOne({
                role: 'teacher',
                isActive: true,
                assignments: {
                  $elemMatch: {
                    classId: c._id,
                    divisionName: d.name,
                    role: 'ClassTeacher',
                  },
                },
              }).select('name teacherId');

              if (ctUser) {
                classTeacherName = ctUser.name;
                classTeacherCode = ctUser.teacherId;
              }
            }

            return {
              name: d.name,
              classTeacher: classTeacherName,
              teacherId: classTeacherCode,
              subjectTeachers: subjectTeacherList,
            };
          })
        );

        return {
          _id: c._id,
          name: c.name,
          academicYear: c.academicYear,
          schoolId: c.schoolId?._id,
          school: c.schoolId?.name || 'Unknown',
          schoolCode: c.schoolId?.code || '',
          isActive: c.isActive,
          totalDivisions: c.divisions?.length || 0,
          totalSubjects: subjects.length,
          divisions: divisionsWithTeachers,
          subjects: subjects.map((s) => ({
            name: s.name,
            code: s.code,
            type: s.type,
          })),
        };
      })
    );

    res.status(200).json({
      success: true,
      count: report.length,
      data: report,
    });
  } catch (error) {
    console.error('🔥 CLASS REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject-wise report
// @route   GET /api/reports/subjects
// ============================================
export const getSubjectReport = async (req, res) => {
  try {
    const { schoolId } = req.query;

    const subjects = await Subject.find({ isActive: true })
      .populate({
        path: 'classId',
        select: 'name academicYear schoolId',
        populate: { path: 'schoolId', select: 'name code' },
      })
      .sort({ name: 1 });

    let filtered = subjects;
    if (schoolId) {
      filtered = subjects.filter(
        (s) => (s.classId?.schoolId?._id || s.classId?.schoolId) === schoolId
      );
    }

    const report = filtered.map((s) => ({
      _id: s._id,
      classId: s.classId?._id?.toString() || '',
      schoolId: s.classId?.schoolId?._id?.toString() || '',
      name: s.name,
      code: s.code,
      type: s.type,
      credits: s.credits,
      semester: s.semester,
      class: s.classId?.name || 'Unknown',
      academicYear: s.classId?.academicYear || '',
      school: s.classId?.schoolId?.name || 'Unknown',
    }));

    res.status(200).json({
      success: true,
      count: report.length,
      data: report,
    });
  } catch (error) {
    console.error('🔥 SUBJECT REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    School-wise detailed report
// @route   GET /api/reports/schools
// ============================================
export const getSchoolReport = async (req, res) => {
  try {
    const schools = await School.find({ isActive: true }).sort({ name: 1 });

    const report = await Promise.all(
      schools.map(async (s) => {
        // Classes in this school
        const schoolClasses = await Class.find({
          schoolId: s._id,
        })
          .populate('divisions.classTeacherId', 'name teacherId')
          .sort({ name: 1 });

        const classIds = schoolClasses.map((c) => c._id);

        // Subjects
        const subjects = await Subject.find({
          classId: { $in: classIds },
          isActive: true,
        })
          .populate('classId', 'name academicYear')
          .sort({ name: 1 });

        // Teachers
        const teachers = await User.find({
          role: 'teacher',
          isActive: true,
          'assignments.schoolId': s._id,
        })
          .select('name teacherId email phone assignments')
          .populate('assignments.classId', 'name')
          .populate('assignments.subjectId', 'name code')
          .sort({ name: 1 });

        const teacherList = teachers.map((t) => {
          const schoolAssignments = (t.assignments || []).filter(
            (a) =>
              (a.schoolId?._id || a.schoolId)?.toString() === s._id.toString()
          );

          const classesTeaching = [
            ...new Set(
              schoolAssignments.map((a) => a.classId?.name).filter(Boolean)
            ),
          ];

          const subjectsTeaching = [
            ...new Set(
              schoolAssignments.map((a) => a.subjectId?.name).filter(Boolean)
            ),
          ];

          const isClassTeacher = schoolAssignments.some(
            (a) => a.role === 'ClassTeacher'
          );

          return {
            _id: t._id,
            name: t.name,
            teacherId: t.teacherId,
            email: t.email,
            phone: t.phone,
            totalAssignments: schoolAssignments.length,
            classesTeaching,
            subjectsTeaching,
            isClassTeacher,
          };
        });

        const classList = schoolClasses.map((c) => ({
          _id: c._id,
          name: c.name,
          academicYear: c.academicYear,
          totalDivisions: c.divisions?.length || 0,
          divisions: (c.divisions || []).map((d) => ({
            name: d.name,
            classTeacher: d.classTeacherId?.name || 'Not assigned',
            teacherId: d.classTeacherId?.teacherId || '',
          })),
        }));

        const subjectList = subjects.map((subj) => ({
          _id: subj._id,
          name: subj.name,
          code: subj.code,
          type: subj.type,
          credits: subj.credits,
          className: subj.classId?.name || '',
          academicYear: subj.classId?.academicYear || '',
        }));

        return {
          _id: s._id,
          name: s.name,
          code: s.code,
          type: s.type,
          city: s.city,
          state: s.state,
          phone: s.phone,
          email: s.email,
          totalTeachers: teachers.length,
          totalClasses: schoolClasses.length,
          totalSubjects: subjects.length,
          teachers: teacherList,
          classes: classList,
          subjects: subjectList,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: report.length,
      data: report,
    });
  } catch (error) {
    console.error('🔥 SCHOOL REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Lecture-wise report
// @route   GET /api/reports/lectures
// ============================================
export const getLectureReport = async (req, res) => {
  try {
    const Lecture = (await import('../models/Lecture.js')).default;
    const Attendance = (await import('../models/Attendance.js')).default;
    const Student = (await import('../models/Student.js')).default;

    const { from, to, classId, teacherId, division } = req.query;

    const filter = { isActive: true };

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.date.$lte = endDate;
      }
    } else {
      const now = new Date();
      filter.date = {
        $gte: new Date(now.getFullYear(), now.getMonth(), 1),
        $lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    }

    if (classId) filter.classId = classId;
    if (teacherId) filter.teacherId = teacherId;
    if (division) filter.divisionName = division.toUpperCase();

    const lectures = await Lecture.find(filter)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code')
      .populate('teacherId', 'name teacherId')
      .sort({ date: -1, startTime: -1 })
      .limit(500);

    const lectureReports = await Promise.all(
      lectures.map(async (l) => {
        const totalStudents = await Student.countDocuments({
          classId: l.classId?._id,
          divisionName: l.divisionName,
          isActive: true,
        });

        const attendance = await Attendance.find({ lectureId: l._id });
        const marked = attendance.length;
        const present = attendance.filter(
          (a) => a.status === 'Present' || a.status === 'Late'
        ).length;
        const absent = attendance.filter((a) => a.status === 'Absent').length;
        const late = attendance.filter((a) => a.status === 'Late').length;
        const excused = attendance.filter(
          (a) => a.status === 'Excused'
        ).length;

        const percentage =
          marked > 0 ? parseFloat(((present / marked) * 100).toFixed(2)) : 0;

        return {
          _id: l._id,
          date: l.date,
          startTime: l.startTime,
          endTime: l.endTime,
          room: l.room,
          status: l.status,
          subject: l.subjectId?.name || 'Unknown',
          subjectCode: l.subjectId?.code || '',
          className: l.classId?.name || 'Unknown',
          academicYear: l.classId?.academicYear || '',
          divisionName: l.divisionName,
          schoolName: l.schoolId?.name || 'Unknown',
          teacherName: l.teacherId?.name || 'Unknown',
          teacherId: l.teacherId?.teacherId || '',
          totalStudents,
          marked,
          present,
          absent,
          late,
          excused,
          percentage,
        };
      })
    );

    const totalLectures = lectureReports.length;
    const totalPresent = lectureReports.reduce((s, l) => s + l.present, 0);
    const totalMarked = lectureReports.reduce((s, l) => s + l.marked, 0);
    const overallPercentage =
      totalMarked > 0 ? parseFloat(((totalPresent / totalMarked) * 100).toFixed(2)) : 0;

    res.status(200).json({
      success: true,
      count: totalLectures,
      data: lectureReports,
      summary: {
        totalLectures,
        totalPresent,
        totalMarked,
        overallPercentage,
      },
    });
  } catch (error) {
    console.error('🔥 LECTURE REPORT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};