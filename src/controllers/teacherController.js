import User from '../models/User.js';

// @desc    all teachers get
// @route   GET /api/teachers
export const getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ role: 'teacher', isActive: true })
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (error) {
    console.error('🔥 GET TEACHERS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    a teacher get
// @route   GET /api/teachers/:id
export const getTeacher = async (req, res) => {
  try {
    const teacher = await User.findById(req.params.id)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    res.status(200).json({ success: true, data: teacher });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Teacher create please
// @route   POST /api/teachers
export const createTeacher = async (req, res) => {
  try {
    const { name, email, password, phone, teacherId, assignments } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered',
      });
    }

    if (teacherId) {
      const existingTeacherId = await User.findOne({ teacherId });
      if (existingTeacherId) {
        return res.status(400).json({
          success: false,
          message: 'Teacher ID is already in use',
        });
      }
    }

    const teacher = new User({
      name,
      email: normalizedEmail,
      password,
      role: 'teacher',
      phone,
      teacherId,
    });

    if (Array.isArray(assignments)) {
      assignments.forEach((assignment) => {
        if (
          assignment.schoolId &&
          assignment.classId &&
          assignment.divisionName
        ) {
          teacher.assignments.push({
            schoolId: assignment.schoolId,
            classId: assignment.classId,
            divisionName: assignment.divisionName.toUpperCase(),
            subjectId: assignment.subjectId || null,
            role: assignment.role || 'SubjectTeacher',
          });
        }
      });
    }

    await teacher.save();

    const createdTeacher = await User.findById(teacher._id)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    res.status(201).json({
      success: true,
      message: '✅ Teacher added successfully',
      data: createdTeacher,
    });
  } catch (error) {
    console.error('🔥 CREATE TEACHER ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Teacher update please
// @route   PUT /api/teachers/:id
export const updateTeacher = async (req, res) => {
  try {
    const { name, phone, assignments, isActive } = req.body;

    const teacher = await User.findById(req.params.id);

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    if (name) teacher.name = name;
    if (phone !== undefined) teacher.phone = phone;
    if (isActive !== undefined) teacher.isActive = isActive;

    // ✅ assignments complete replace
    if (assignments && Array.isArray(assignments)) {
      teacher.assignments = [];
      assignments.forEach((a) => {
        if (a.schoolId && a.classId && a.divisionName) {
          teacher.assignments.push({
            schoolId: a.schoolId,
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

    res.status(200).json({
      success: true,
      message: '✅ Teacher updated',
      data: populated,
    });
  } catch (error) {
    console.error('🔥 UPDATE TEACHER ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Teacher delete (soft)
// @route   DELETE /api/teachers/:id
export const deleteTeacher = async (req, res) => {
  try {
    const deleted = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!deleted || deleted.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Teacher deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Teacher of password reset do
// @route   PUT /api/teachers/:id/reset-password
export const resetTeacherPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    const teacher = await User.findById(req.params.id);

    if (!teacher || teacher.role !== 'teacher') {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    teacher.password = newPassword;
    await teacher.save();

    res.status(200).json({
      success: true,
      message: '✅ Password reset done',
    });
  } catch (error) {
    console.error('🔥 RESET PASSWORD ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Bulk import teachers
// @route   POST /api/teachers/bulk
// ============================================
export const createBulkTeachers = async (req, res) => {
  try {
    const { teachers } = req.body;

    if (!teachers || !Array.isArray(teachers) || teachers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Teachers array आवश्यक आहे',
      });
    }

    const results = {
      added: [],
      failed: [],
      credentials: [],
    };

    for (const t of teachers) {
      try {
        // Validation
        if (!t.name?.trim() || !t.email?.trim() || !t.teacherId?.trim()) {
          results.failed.push({
            teacherId: t.teacherId || '?',
            name: t.name || '?',
            reason: 'Name, Email, Teacher ID आवश्यक',
          });
          continue;
        }

        const emailLower = t.email.toLowerCase().trim();
        const teacherIdUpper = t.teacherId.toUpperCase().trim();

        // Duplicate email check
        const existingEmail = await User.findOne({ email: emailLower });
        if (existingEmail) {
          results.failed.push({
            teacherId: teacherIdUpper,
            name: t.name,
            reason: `Email ${emailLower} आधीच आहे`,
          });
          continue;
        }

        // Duplicate teacherId check
        const existingId = await User.findOne({ teacherId: teacherIdUpper });
        if (existingId) {
          results.failed.push({
            teacherId: teacherIdUpper,
            name: t.name,
            reason: `Teacher ID ${teacherIdUpper} आधीच आहे`,
          });
          continue;
        }

        // Default password if not provided
        const password = t.password?.trim() || 'Teacher@123';

        // Create teacher
        const teacher = new User({
          name: t.name.trim(),
          email: emailLower,
          password,
          role: 'teacher',
          phone: t.phone?.trim() || '',
          teacherId: teacherIdUpper,
          assignments: [],
        });

        await teacher.save();

        results.added.push({
          name: teacher.name,
          email: teacher.email,
          teacherId: teacher.teacherId,
        });

        // ✅ Save credentials for admin
        results.credentials.push({
          name: teacher.name,
          teacherId: teacher.teacherId,
          email: teacher.email,
          password,
        });
      } catch (err) {
        results.failed.push({
          teacherId: t.teacherId || '?',
          name: t.name || '?',
          reason: err.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `✅ ${results.added.length} teachers add झाले, ${results.failed.length} fail`,
      data: results,
    });
  } catch (error) {
    console.error('🔥 BULK TEACHERS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};