import jwt from 'jsonwebtoken';
import Student from '../models/Student.js';

// ✅ Student Authentication Middleware
export const protectStudent = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Login करा — token नाही',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Student access नाही',
      });
    }

    const student = await Student.findById(decoded.id).select('-password');

    if (!student || !student.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Student सापडला नाही किंवा inactive',
      });
    }

    req.student = student;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
  }
};