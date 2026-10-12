import User from '../models/User.js';
import Student from '../models/Student.js';
import jwt from 'jsonwebtoken';

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// ============================================
// @desc    Student Login
// @route   POST /api/student-auth/login
// ============================================
export const studentLogin = async (req, res) => {
  try {
    const { studentId, email, password } = req.body;

    if ((!studentId && !email) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Student ID / Email आणि Password आवश्यक',
      });
    }

    let user = null;

    // Email ने login
    if (email) {
      user = await User.findOne({
        email: email.toLowerCase().trim(),
        role: 'student',
        isActive: true,
      }).select('+password');
    }

    // Student ID ने login
    if (!user && studentId) {
      const student = await Student.findOne({
        studentId: studentId.toUpperCase().trim(),
        isActive: true,
        hasStudentLogin: true,
      });

      if (student && student.userId) {
        user = await User.findById(student.userId).select('+password');
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials किंवा login नाही',
      });
    }

    // Password check
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Student details
    const student = await Student.findOne({ userId: user._id })
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code');

    const token = generateToken(user._id, 'student');

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      student: student
        ? {
            id: student._id,
            name: student.name,
            studentId: student.studentId,
            rollNumber: student.rollNumber,
            className: student.classId?.name,
            divisionName: student.divisionName,
            academicYear: student.classId?.academicYear,
            schoolName: student.schoolId?.name,
          }
        : null,
    });
  } catch (error) {
    console.error('🔥 STUDENT LOGIN ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Current Student
// @route   GET /api/student-auth/me
// ============================================
export const getCurrentStudent = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.id })
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    res.status(200).json({ success: true, student });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};