import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// ============================================
// @desc    Teacher of profile + assignments get
// @route   GET /api/teacher-settings/profile
// ============================================
export const getTeacherProfile = async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id)
      .select('-password')
      .populate('assignments.schoolId', 'name code')
      .populate('assignments.classId', 'name academicYear')
      .populate('assignments.subjectId', 'name code');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    res.status(200).json({
      success: true,
      data: teacher,
    });
  } catch (error) {
    console.error('🔥 TEACHER PROFILE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher of profile update do
// @route   PUT /api/teacher-settings/profile
// ============================================
export const updateTeacherProfile = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    const teacher = await User.findById(req.user.id);

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    // Email duplicate check (if changing is then)
    if (email && email !== teacher.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'this Email already in use is',
        });
      }
      teacher.email = email;
    }

    if (name) teacher.name = name.trim();
    if (phone !== undefined) teacher.phone = phone?.trim() || '';

    await teacher.save();

    res.status(200).json({
      success: true,
      message: '✅ Profile updated',
      data: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        teacherId: teacher.teacherId,
      },
    });
  } catch (error) {
    console.error('🔥 UPDATE TEACHER PROFILE ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'this Email already in use is',
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher of password change do
// @route   PUT /api/teacher-settings/change-password
// ============================================
export const changeTeacherPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Old and new passwords are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters',
      });
    }

    const teacher = await User.findById(req.user.id).select('+password');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found',
      });
    }

    // old password check
    const isMatch = await bcrypt.compare(
      currentPassword,
      teacher.password
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Old password is incorrect',
      });
    }

    // new password set (pre-save hook hash will)
    teacher.password = newPassword;
    await teacher.save();

    res.status(200).json({
      success: true,
      message: '✅ Password changed',
    });
  } catch (error) {
    console.error('🔥 TEACHER PASSWORD ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};