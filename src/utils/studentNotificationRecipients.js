import Parent from '../models/Parent.js';
import User from '../models/User.js';

export const getStudentNotificationUserId = async (student) => {
  if (student.userId) return student.userId;

  const user = await User.findOne({
    studentId: student._id,
    role: 'student',
    isActive: true,
  }).select('_id');

  return user?._id || null;
};

export const getParentNotificationUserIds = async (student) => {
  const userIds = new Map();

  if (student.parentUserId) {
    userIds.set(student.parentUserId.toString(), student.parentUserId);
  }

  const parents = await Parent.find({
    'children.studentId': student._id,
    isActive: true,
  }).select('userId');

  parents.forEach((parent) => {
    if (parent.userId) userIds.set(parent.userId.toString(), parent.userId);
  });

  const legacyParentUsers = await User.find({
    studentId: student._id,
    role: 'parent',
    isActive: true,
  }).select('_id');

  legacyParentUsers.forEach((user) => {
    userIds.set(user._id.toString(), user._id);
  });

  if (student.parentEmail) {
    const parentByEmail = await User.findOne({
      email: student.parentEmail.toLowerCase().trim(),
      role: 'parent',
      isActive: true,
    }).select('_id');
    if (parentByEmail) {
      userIds.set(parentByEmail._id.toString(), parentByEmail._id);
    }
  }

  return [...userIds.values()];
};
