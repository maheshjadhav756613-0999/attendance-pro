import User from '../models/User.js';
import School from '../models/School.js';
import Class from '../models/Class.js';
import bcrypt from 'bcryptjs';

// ============================================
// HELPER 1: Teacher Class Teacher आहे का? (specific class+division)
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
// HELPER 2: Teacher या school चा Class Teacher आहे का?
// ============================================
const isClassTeacherOfSchool = (teacher, schoolId) => {
  if (!teacher || !teacher.assignments) return false;
  return teacher.assignments.some((a) => {
    const aSchoolId = (a.schoolId?._id || a.schoolId)?.toString();
    return aSchoolId === schoolId?.toString() && a.role === 'ClassTeacher';
  });
};

// ============================================
// HELPER 3: ✅ Optimized Next Teacher ID
// ============================================
const getNextTeacherIdValue = async () => {
  // शेवटचा teacher शोध (sorted desc, limit 1)
  const lastTeacher = await User.findOne({
    role: 'teacher',
    teacherId: { $regex: /^TCH\d+$/i },
  })
    .sort({ teacherId: -1 })
    .select('teacherId')
    .lean();

  if (!lastTeacher || !lastTeacher.teacherId) {
    return 'TCH001';
  }

  const match = lastTeacher.teacherId.match(/^TCH(\d+)$/i);
  const maxNumber = match ? Number(match[1]) : 0;

  return `TCH${String(maxNumber + 1).padStart(3, '0')}`;
};

// ============================================
// @desc    Class Teacher ला school मधले classes दाखवा
// @route   GET /api/class-teacher/classes?schoolId=xxx
// ============================================
export const getSchoolClasses = async (req, res) => {
  try {
    const { schoolId } = req.query;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID आवश्यक',
      });
    }

    const teacher = await User.findById(req.user.id).select('assignments');
    if (!isClassTeacherOfSchool(teacher, schoolId)) {
      return res.status(403).json({
        success: false,
        message: 'तू या school चा Class Teacher नाही',
      });
    }

    const classes = await Class.find({ schoolId, isActive: true })
      .select('name academicYear divisions schoolId')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes,
    });
  } catch (error) {
    console.error('🔥 GET CLASS TEACHER SCHOOL CLASSES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher च्या school मधले teachers
// @route   GET /api/class-teacher/teachers?schoolId=xxx
// ============================================
export const getSchoolTeachers = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const teacher = await User.findById(req.user.id);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID आवश्यक',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOfSchool(teacher, schoolId);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या school चा Class Teacher नाही',
      });
    }

    // या school मधले सगळे teachers
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      'assignments.schoolId': schoolId,
    })
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code')
      .sort({ createdAt: -1 });

    // प्रत्येक teacher ची edit/delete permission add कर
    const teachersWithPermission = teachers.map((t) => ({
      ...t.toObject(),
      canEdit: t.addedBy?.toString() === req.user.id.toString(),
      addedByMe: t.addedBy?.toString() === req.user.id.toString(),
    }));

    res.status(200).json({
      success: true,
      count: teachersWithPermission.length,
      data: teachersWithPermission,
    });
  } catch (error) {
    console.error('🔥 GET SCHOOL TEACHERS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher — Teacher add करा
// @route   POST /api/class-teacher/teachers
// ============================================
export const addTeacher = async (req, res) => {
  try {
    const classTeacher = await User.findById(req.user.id);

    const {
      name,
      email,
      password,
      phone,
      teacherId,
      schoolId,
      assignments,
    } = req.body;

    // Validation
    if (!name || !email || !password || !schoolId) {
      return res.status(400).json({
        success: false,
        message: 'Name, Email, Password आणि School आवश्यक',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password कमीत कमी 6 characters',
      });
    }

    // ✅ Class Teacher check
    const isCT = isClassTeacherOfSchool(classTeacher, schoolId);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या school चा Class Teacher नाही — Teacher add करता येत नाही',
      });
    }

    // School exist आहे का?
    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({
        success: false,
        message: 'School सापडलं नाही',
      });
    }

    // Email duplicate
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'हा Email आधीच registered आहे',
      });
    }

    // ✅ Auto-generate Teacher ID on server
    const finalTeacherId = await getNextTeacherIdValue();

    // ✅ Teacher create
    const teacher = new User({
      name,
      email,
      password,
      role: 'teacher',
      phone,
      teacherId: finalTeacherId,
      assignments: [],
      addedBy: req.user.id,
      addedByRole: 'teacher',
    });

    // Assignments process
    if (assignments && Array.isArray(assignments)) {
      assignments.forEach((a) => {
        if (a.classId && a.divisionName) {
          teacher.assignments.push({
            schoolId: schoolId, // Force school
            classId: a.classId,
            divisionName: a.divisionName.toUpperCase(),
            subjectId: a.subjectId || null,
            role: a.role || 'SubjectTeacher',
          });
        }
      });
    }

    await teacher.save();

    const populated = await User.findById(teacher._id)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    res.status(201).json({
      success: true,
      message: `✅ Teacher ${teacher.name} (${teacher.teacherId}) यशस्वीरीत्या add झाला`,
      data: populated,
    });
  } catch (error) {
    console.error('🔥 ADD TEACHER ERROR:', error);

    if (error.code === 11000 && error.keyPattern?.teacherId) {
      return res.status(409).json({
        success: false,
        message: 'हा Teacher ID नुकताच वापरला गेला. पुन्हा Add Teacher करून प्रयत्न करा.',
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher ने add केलेला teacher update करा
// @route   PUT /api/class-teacher/teachers/:id
// ============================================
export const updateTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id);

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    // ✅ फक्त स्वतः add केलेल्या teacher ला edit
    if (teacher.addedBy?.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: '⛔ हा teacher तू add केलेला नाही — edit करता येत नाही',
      });
    }

    const { name, phone, assignments, isActive } = req.body;

    if (name) teacher.name = name;
    if (phone !== undefined) teacher.phone = phone;
    if (isActive !== undefined) teacher.isActive = isActive;

    // Assignments update
    if (assignments && Array.isArray(assignments)) {
      // फक्त त्या school चेच assignments allowed
      const allowedSchoolIds = teacher.assignments.map(
        (a) => a.schoolId?._id?.toString() || a.schoolId?.toString()
      );

      teacher.assignments = [];
      assignments.forEach((a) => {
        if (a.schoolId && a.classId && a.divisionName) {
          if (allowedSchoolIds.includes(a.schoolId?.toString())) {
            teacher.assignments.push({
              schoolId: a.schoolId,
              classId: a.classId,
              divisionName: a.divisionName.toUpperCase(),
              subjectId: a.subjectId || null,
              role: a.role || 'SubjectTeacher',
            });
          }
        }
      });
    }

    await teacher.save();

    const populated = await User.findById(teacher._id)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    res.status(200).json({
      success: true,
      message: '✅ Teacher update झाला',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 UPDATE TEACHER ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher ने add केलेला teacher delete करा
// @route   DELETE /api/class-teacher/teachers/:id
// ============================================
export const deleteTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id);

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    // ✅ फक्त स्वतः add केलेल्या teacher ला delete
    if (teacher.addedBy?.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: '⛔ हा teacher तू add केलेला नाही — delete करता येत नाही',
      });
    }

    // Soft delete
    teacher.isActive = false;
    await teacher.save();

    res.status(200).json({
      success: true,
      message: '✅ Teacher delete झाला',
    });
  } catch (error) {
    console.error('🔥 DELETE TEACHER ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Auto-generate next Teacher ID
// @route   GET /api/class-teacher/next-teacher-id
// ============================================
export const getNextTeacherId = async (req, res) => {
  try {
    const { schoolId } = req.query;
    const classTeacher = await User.findById(req.user.id);

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID आवश्यक',
      });
    }

    if (!isClassTeacherOfSchool(classTeacher, schoolId)) {
      return res.status(403).json({
        success: false,
        message: 'तू या school चा Class Teacher नाही',
      });
    }

    const nextId = await getNextTeacherIdValue();
    console.log(`🔢 Next Teacher ID preview: ${nextId}`);

    res.status(200).json({
      success: true,
      data: { teacherId: nextId },
    });
  } catch (error) {
    console.error('🔥 NEXT TEACHER ID ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};