import User from '../models/User.js';

export const getTeacherDashboard = async (req, res) => {
  try {
    console.log('═══════════════════════════════════════');
    console.log('🔍 TEACHER DASHBOARD CALLED');
    console.log('📝 User ID from token:', req.user.id);

    const teacher = await User.findById(req.user.id)
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear divisions')
      .populate('assignments.subjectId', 'name code type');

    if (!teacher) {
      console.log('❌ Teacher not found');
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    console.log('✅ Teacher found:', teacher.name);
    console.log('📋 Raw assignments:', teacher.assignments?.length || 0);

    const classMap = {};

    (teacher.assignments || []).forEach((a, i) => {
      console.log(`\n--- Assignment ${i + 1} ---`);
      console.log('  School:', a.schoolId?.name || '❌ MISSING');
      console.log('  Class:', a.classId?.name || '❌ MISSING');
      console.log('  Division:', a.divisionName || '❌ MISSING');
      console.log('  Subject:', a.subjectId?.name || '❌ MISSING');
      console.log('  Role:', a.role);

      if (!a.classId || !a.divisionName) {
        console.log('  ⚠️ Skipping invalid');
        return;
      }

      const schoolId = (a.schoolId?._id || a.schoolId)?.toString();
      const classId = (a.classId?._id || a.classId)?.toString();
      const key = `${schoolId || 'noschool'}-${classId}-${a.divisionName}`;

      if (!classMap[key]) {
        classMap[key] = {
          schoolId,
          schoolName: a.schoolId?.name || 'Unknown School',
          classId,
          className: a.classId?.name || 'Unknown Class',
          academicYear: a.classId?.academicYear || '',
          divisionName: a.divisionName,
          isClassTeacher: false,
          subjects: [],
        };
      }

      if (a.role === 'ClassTeacher') {
        classMap[key].isClassTeacher = true;
      }

      if (a.subjectId) {
        const subjId = (a.subjectId?._id || a.subjectId)?.toString();
        const exists = classMap[key].subjects.some((s) => s._id === subjId);
        if (!exists) {
          classMap[key].subjects.push({
            _id: subjId,
            name: a.subjectId?.name || 'Unknown',
            code: a.subjectId?.code || '',
            type: a.subjectId?.type || 'Theory',
          });
        }
      }
    });

    const classes = Object.values(classMap);

    console.log('\n✅ Unique classes:', classes.length);
    console.log(
      '✅ Total subjects:',
      classes.reduce((sum, c) => sum + c.subjects.length, 0)
    );
    console.log('═══════════════════════════════════════\n');

    const uniqueSchools = new Set(
      classes.map((c) => c.schoolId).filter(Boolean)
    );
    const uniqueSubjects = new Set();
    classes.forEach((c) =>
      c.subjects.forEach((s) => uniqueSubjects.add(s._id))
    );

    res.status(200).json({
      success: true,
      data: {
        teacher: {
          name: teacher.name,
          teacherId: teacher.teacherId,
          email: teacher.email,
          phone: teacher.phone,
        },
        stats: {
          totalClasses: classes.length,
          totalSchools: uniqueSchools.size,
          totalSubjects: uniqueSubjects.size,
          totalStudents: 0,
        },
        classes,
      },
    });
  } catch (error) {
    console.error('🔥 TEACHER DASHBOARD ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    आजच्या Pending Lectures (attendance बाकी)
// @route   GET /api/teacher-dashboard/pending
// ============================================
export const getPendingLectures = async (req, res) => {
  try {
    const Lecture = (await import('../models/Lecture.js')).default;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pendingLectures = await Lecture.find({
      teacherId: req.user.id,
      date: { $gte: today, $lt: tomorrow },
      isActive: true,
      status: 'Scheduled',
    })
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: pendingLectures.length,
      data: pendingLectures,
    });
  } catch (error) {
    console.error('🔥 PENDING LECTURES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};