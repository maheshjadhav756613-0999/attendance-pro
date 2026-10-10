import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Student from '../models/Student.js';

// ============================================
// JWT Token Generate
// ============================================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// ============================================
// @desc    Login (Admin/Teacher/Parent/Student)
// @route   POST /api/auth/login
// ============================================
export const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    // Validation
    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, password आणि role आवश्यक आहे',
      });
    }

    // User शोध
    const user = await User.findOne({ email, role }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account inactive आहे. Admin ला संपर्क करा.',
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

    // ✅ Parent/Student साठी student data fetch
    let studentInfo = null;
    if ((role === 'parent' || role === 'student') && user.studentId) {
      const student = await Student.findById(user.studentId)
        .populate('classId', 'name academicYear')
        .populate('schoolId', 'name code');

      if (student) {
        studentInfo = {
          _id: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          seatNumber: student.seatNumber,
          prnNumber: student.prnNumber,
          studentId: student.studentId,
          gender: student.gender,
          className: student.classId?.name || '',
          divisionName: student.divisionName,
          academicYear: student.academicYear,
          schoolName: student.schoolId?.name || '',
          mobile: student.mobile,
          email: student.email,
          parentName: student.parentName,
          parentPhone: student.parentPhone,
        };
      }
    }

    // Token generate
    const token = generateToken(user._id);

    // Response
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teacherId: user.teacherId || null,
        studentId: user.studentId || null,
        student: studentInfo,
      },
    });
  } catch (error) {
    console.error('🔥 LOGIN ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================
// @desc    Get current user
// @route   GET /api/auth/me
// ============================================
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User सापडला नाही',
      });
    }

    let studentInfo = null;
    if ((user.role === 'parent' || user.role === 'student') && user.studentId) {
      const student = await Student.findById(user.studentId)
        .populate('classId', 'name academicYear')
        .populate('schoolId', 'name code');

      if (student) {
        studentInfo = {
          _id: student._id,
          name: student.name,
          rollNumber: student.rollNumber,
          seatNumber: student.seatNumber,
          prnNumber: student.prnNumber,
          studentId: student.studentId,
          gender: student.gender,
          className: student.classId?.name || '',
          divisionName: student.divisionName,
          academicYear: student.academicYear,
          schoolName: student.schoolId?.name || '',
          mobile: student.mobile,
          email: student.email,
          parentName: student.parentName,
          parentPhone: student.parentPhone,
        };
      }
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teacherId: user.teacherId || null,
        studentId: user.studentId || null,
        student: studentInfo,
      },
    });
  } catch (error) {
    console.error('🔥 GETME ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ============================================
// @desc    Register (Admin setup)
// @route   POST /api/auth/register
// ============================================
export const register = async (req, res) => {
  try {
    const { name, email, password, role, teacherId, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password आणि role आवश्यक आहे',
      });
    }

    // Email duplicate
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email आधीच registered आहे',
      });
    }

    // Teacher ID duplicate
    if (role === 'teacher' && teacherId) {
      const existingTeacher = await User.findOne({ teacherId });
      if (existingTeacher) {
        return res.status(400).json({
          success: false,
          message: 'Teacher ID आधीच वापरात आहे',
        });
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      teacherId: role === 'teacher' ? teacherId : undefined,
      phone,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        teacherId: user.teacherId || null,
      },
    });
  } catch (error) {
    console.error('🔥 REGISTER ERROR:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};