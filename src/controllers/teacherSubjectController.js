import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import User from '../models/User.js';

// ============================================
// HELPER: Teacher Class Teacher आहे का?
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
// @desc    Class Teacher च्या classes ची list
// @route   GET /api/teacher-subjects/my-classes
// ============================================
export const getMyClassTeacherClasses = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id)
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    // फक्त Class Teacher assignments
    const ctAssignments = (teacher.assignments || []).filter(
      (a) => a.role === 'ClassTeacher' && a.classId && a.divisionName
    );

    const classes = ctAssignments.map((a) => ({
      classId: a.classId?._id,
      className: a.classId?.name,
      academicYear: a.classId?.academicYear,
      schoolId: a.schoolId?._id,
      schoolName: a.schoolId?.name,
      schoolCode: a.schoolId?.code,
      divisionName: a.divisionName,
    }));

    res.status(200).json({
      success: true,
      count: classes.length,
      data: classes,
    });
  } catch (error) {
    console.error('🔥 MY CLASSES ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class चे subjects मिळवा
// @route   GET /api/teacher-subjects?classId=xxx
// ============================================
export const getSubjects = async (req, res) => {
  try {
    const { classId } = req.query;
    const teacher = await User.findById(req.user.id);

    if (!classId) {
      return res.status(400).json({
        success: false,
        message: 'Class ID आवश्यक',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(teacher, classId, req.query.division);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    const subjects = await Subject.find({
      classId,
      isActive: true,
    }).sort({ name: 1 });

    // प्रत्येक subject साठी assigned teachers शोध
    const subjectsWithTeachers = await Promise.all(
      subjects.map(async (subj) => {
        const teachers = await User.find({
          role: 'teacher',
          isActive: true,
          'assignments.subjectId': subj._id,
        })
          .select('name teacherId')
          .populate('assignments.classId', 'name');

        return {
          ...subj.toObject(),
          assignedTeachers: teachers.map((t) => ({
            _id: t._id,
            name: t.name,
            teacherId: t.teacherId,
          })),
        };
      })
    );

    res.status(200).json({
      success: true,
      count: subjectsWithTeachers.length,
      data: subjectsWithTeachers,
    });
  } catch (error) {
    console.error('🔥 GET SUBJECTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Class Teacher — नवीन subject add करा
// @route   POST /api/teacher-subjects
// ============================================
export const createSubject = async (req, res) => {
  try {
    const {
      classId,
      divisionName,
      name,
      code,
      type,
      credits,
      semester,
      description,
    } = req.body;

    const teacher = await User.findById(req.user.id);

    // Validation
    if (!classId || !divisionName || !name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Class, Division, Name आणि Code आवश्यक',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(teacher, classId, divisionName);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही — Subject add करता येत नाही',
      });
    }

    // Duplicate check (same class मध्ये same code)
    const existing = await Subject.findOne({
      classId,
      code: code.toUpperCase(),
      isActive: true,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `हा Subject Code (${code}) या class मध्ये आधीच आहे`,
      });
    }

    // Subject create
    const subject = await Subject.create({
      classId,
      name,
      code,
      type: type || 'Theory',
      credits: credits || 4,
      semester,
      description,
    });

    const populated = await Subject.findById(subject._id).populate(
      'classId',
      'name academicYear'
    );

    res.status(201).json({
      success: true,
      message: '✅ Subject यशस्वीरीत्या add झाला',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 CREATE SUBJECT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject update करा
// @route   PUT /api/teacher-subjects/:id
// ============================================
export const updateSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    const teacher = await User.findById(req.user.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject सापडला नाही',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(
      teacher,
      subject.classId.toString(),
      req.body.divisionName || 'A'
    );

    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    const { name, code, type, credits, semester, description } = req.body;

    if (name) subject.name = name;
    if (code) subject.code = code.toUpperCase();
    if (type) subject.type = type;
    if (credits !== undefined) subject.credits = credits;
    if (semester !== undefined) subject.semester = semester;
    if (description !== undefined) subject.description = description;

    await subject.save();

    res.status(200).json({
      success: true,
      message: '✅ Subject update झाला',
      data: subject,
    });
  } catch (error) {
    console.error('🔥 UPDATE SUBJECT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject delete (soft)
// @route   DELETE /api/teacher-subjects/:id
// ============================================
export const deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);
    const teacher = await User.findById(req.user.id);

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: 'Subject सापडला नाही',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(
      teacher,
      subject.classId.toString(),
      req.query.division || 'A'
    );

    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    // Soft delete
    subject.isActive = false;
    await subject.save();

    res.status(200).json({
      success: true,
      message: '✅ Subject delete झाला',
    });
  } catch (error) {
    console.error('🔥 DELETE SUBJECT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Same school मधल्या teachers ची list
// @route   GET /api/teacher-subjects/available-teachers?schoolId=xxx
// ============================================
// ============================================
// @desc    Same school मधल्या teachers ची list
// @route   GET /api/teacher-subjects/available-teachers?schoolId=xxx
// ============================================
export const getAvailableTeachers = async (req, res) => {
  try {
    const { schoolId } = req.query;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID आवश्यक',
      });
    }

    console.log(`🔍 Fetching teachers for schoolId: ${schoolId}`);
    console.log(`🚫 Excluding current user: ${req.user.id}`);

    // ✅ Fix 1: $elemMatch वापर — नेमका match मिळतो
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      _id: { $ne: req.user.id },
      assignments: {
        $elemMatch: {
          schoolId: schoolId,
        },
      },
    })
      .select('name teacherId email phone addedBy')
      .sort({ name: 1 })
      .lean();

    // ✅ Fix 2: सगळ्या teachers पण शोध (fallback)
    let allTeachers = [];
    if (teachers.length === 0) {
      console.log('⚠️ $elemMatch ने काही सापडलं नाही, fallback try करतोय...');
      
      allTeachers = await User.find({
        role: 'teacher',
        isActive: true,
        _id: { $ne: req.user.id },
      })
        .select('name teacherId email phone assignments')
        .lean();

      // Manual filter — कोणत्याही assignment मध्ये schoolId match?
      const filtered = allTeachers.filter((t) => {
        return (t.assignments || []).some((a) => {
          const aSchoolId = (a.schoolId?._id || a.schoolId)?.toString();
          return aSchoolId === schoolId.toString();
        });
      });

      console.log(`✅ Fallback मध्ये ${filtered.length} teachers मिळाले`);

      return res.status(200).json({
        success: true,
        count: filtered.length,
        data: filtered,
      });
    }

    console.log(`✅ Direct query मध्ये ${teachers.length} teachers मिळाले`);

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (error) {
    console.error('🔥 AVAILABLE TEACHERS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject Teacher ला assign करा
// @route   POST /api/teacher-subjects/assign
// ============================================
export const assignSubjectToTeacher = async (req, res) => {
  try {
    const { subjectId, teacherId, classId, divisionName } = req.body;

    if (!subjectId || !teacherId || !classId || !divisionName) {
      return res.status(400).json({
        success: false,
        message: 'सगळी fields आवश्यक',
      });
    }

    const classTeacher = await User.findById(req.user.id);
    const subjectTeacher = await User.findById(teacherId);
    const subject = await Subject.findById(subjectId);

    if (!subjectTeacher || !subject) {
      return res.status(404).json({
        success: false,
        message: 'Teacher किंवा Subject सापडला नाही',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(classTeacher, classId, divisionName);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    // Subject या class चा आहे का?
    if (subject.classId.toString() !== classId) {
      return res.status(400).json({
        success: false,
        message: 'हा subject या class चा नाही',
      });
    }

    // Teacher त्या school मध्ये आहे का?
    const subjectTeacherSchoolIds = (subjectTeacher.assignments || [])
      .map((a) => a.schoolId?._id?.toString() || a.schoolId?.toString())
      .filter(Boolean);

    const classTeacherSchoolIds = (classTeacher.assignments || [])
      .map((a) => a.schoolId?._id?.toString() || a.schoolId?.toString())
      .filter(Boolean);

    const commonSchool = subjectTeacherSchoolIds.find((id) =>
      classTeacherSchoolIds.includes(id)
    );

    if (!commonSchool) {
      return res.status(400).json({
        success: false,
        message: 'हा teacher तुझ्या school मध्ये नाही',
      });
    }

    // Duplicate check — हा teacher आधीच या subject ला assigned आहे का?
    const alreadyAssigned = (subjectTeacher.assignments || []).some(
      (a) =>
        (a.subjectId?._id || a.subjectId)?.toString() === subjectId &&
        (a.classId?._id || a.classId)?.toString() === classId &&
        a.divisionName === divisionName.toUpperCase()
    );

    if (alreadyAssigned) {
      return res.status(400).json({
        success: false,
        message: 'हा teacher आधीच या subject ला assigned आहे',
      });
    }

    // Assignment add कर
    subjectTeacher.assignments.push({
      schoolId: commonSchool,
      classId,
      divisionName: divisionName.toUpperCase(),
      subjectId,
      role: 'SubjectTeacher',
    });

    await subjectTeacher.save();

    // Populate करून return
    const populated = await User.findById(teacherId)
      .select('name teacherId email')
      .populate('assignments.classId', 'name')
      .populate('assignments.subjectId', 'name code');

    res.status(201).json({
      success: true,
      message: `✅ ${subjectTeacher.name} ला ${subject.name} assign झाला`,
      data: populated,
    });
  } catch (error) {
    console.error('🔥 ASSIGN SUBJECT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Subject वरून teacher remove करा
// @route   DELETE /api/teacher-subjects/remove-assignment
// ============================================
export const removeSubjectTeacher = async (req, res) => {
  try {
    const { subjectId, teacherId, classId, divisionName } = req.body;

    const classTeacher = await User.findById(req.user.id);
    const subjectTeacher = await User.findById(teacherId);

    if (!subjectTeacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher सापडला नाही',
      });
    }

    // Class Teacher check
    const isCT = isClassTeacherOf(classTeacher, classId, divisionName);
    if (!isCT) {
      return res.status(403).json({
        success: false,
        message: 'तू या class चा Class Teacher नाही',
      });
    }

    // Assignment remove
    subjectTeacher.assignments = subjectTeacher.assignments.filter(
      (a) =>
        !(
          (a.subjectId?._id || a.subjectId)?.toString() === subjectId &&
          (a.classId?._id || a.classId)?.toString() === classId &&
          a.divisionName === divisionName.toUpperCase()
        )
    );

    await subjectTeacher.save();

    res.status(200).json({
      success: true,
      message: '✅ Teacher ला subject वरून remove केलं',
    });
  } catch (error) {
    console.error('🔥 REMOVE ASSIGNMENT ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};