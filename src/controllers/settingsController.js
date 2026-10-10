import User from '../models/User.js';
import bcrypt from 'bcryptjs';

// @desc    Current user of profile get
// @route   GET /api/settings/profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('🔥 GET PROFILE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Profile update do
// @route   PUT /api/settings/profile
export const updateProfile = async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Email change if present duplicate check
    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'this Email already in use is',
        });
      }
      user.email = email;
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;

    await user.save();

    res.status(200).json({
      success: true,
      message: '✅ Profile updated',
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('🔥 UPDATE PROFILE ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Password change do (old password required)
// @route   PUT /api/settings/change-password
export const changePassword = async (req, res) => {
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

    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // old password check
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Old password is incorrect',
      });
    }

    // new password set (pre-save hook hash will)
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: '✅ Password changed',
    });
  } catch (error) {
    console.error('🔥 CHANGE PASSWORD ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    System statistics
// @route   GET /api/settings/system-info
export const getSystemInfo = async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const School = (await import('../models/School.js')).default;
    const Class = (await import('../models/Class.js')).default;
    const Subject = (await import('../models/Subject.js')).default;
    const Student = (await import('../models/Student.js')).default;
    const Lecture = (await import('../models/Lecture.js')).default;
    const Attendance = (await import('../models/Attendance.js')).default;

    const [teachers, schools, classes, subjects, students, lectures, attendance] =
      await Promise.all([
        User.countDocuments({ role: 'teacher', isActive: true }),
        School.countDocuments({ isActive: true }),
        Class.countDocuments({ isActive: true }),
        Subject.countDocuments({ isActive: true }),
        Student.countDocuments({ isActive: true }),
        Lecture.countDocuments({ isActive: true }),
        Attendance.countDocuments(),
      ]);

    res.status(200).json({
      success: true,
      data: {
        teachers,
        schools,
        classes,
        subjects,
        students,
        lectures,
        attendance,
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        serverTime: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  } catch (error) {
    console.error('🔥 SYSTEM INFO ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};