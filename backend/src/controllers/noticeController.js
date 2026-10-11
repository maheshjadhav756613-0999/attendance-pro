import Notice from '../models/Notice.js';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import { notifyNewNotice } from './notificationTriggers.js';

const normalizeSchoolIds = (value) => {
  const rawIds = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(rawIds.filter(Boolean).map((id) => String(id)))];
};

const getUserSchoolIds = async (user) => {
  if (!user || !user.id) return [];

  const userId = user.id;

  if (user.role === 'teacher') {
    const teacher = await mongoose.model('User').findById(userId).select('assignments');
    return (teacher?.assignments || [])
      .map((assignment) => assignment.schoolId)
      .filter(Boolean)
      .map((id) => String(id));
  }

  if (user.role === 'student') {
    const student = await Student.findOne({ userId }).select('schoolId');
    return student?.schoolId ? [String(student.schoolId)] : [];
  }

  if (user.role === 'parent') {
    const studentRecords = await Student.find({ parentUserId: userId }).select('schoolId');
    return [...new Set(studentRecords.map((student) => student.schoolId).filter(Boolean).map((id) => String(id)))];
  }

  return [];
};

// @desc    सगळ्या notices
// @route   GET /api/notices
export const getNotices = async (req, res) => {
  try {
    const filter = { isActive: true };

    if (req.user.role !== 'admin') {
      filter.targetAudience = req.user.role;

      const userSchoolIds = await getUserSchoolIds(req.user);
      if (userSchoolIds.length > 0) {
        filter.$or = [
          { schoolId: { $in: userSchoolIds } },
          { schoolIds: { $in: userSchoolIds } },
          { schoolId: null },
          { schoolIds: { $size: 0 } },
        ];
      }
    }

    const notices = await Notice.find(filter)
      .populate('postedBy', 'name role')
      .populate('schoolId', 'name')
      .populate('schoolIds', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: notices.length,
      data: notices,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    नवीन notice
// @route   POST /api/notices
export const createNotice = async (req, res) => {
  try {
    const {
      title,
      content,
      category,
      priority,
      targetAudience,
      schoolIds,
      schoolId,
      expiresAt,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title आणि Content आवश्यक',
      });
    }

    const normalizedSchoolIds = normalizeSchoolIds(schoolIds || schoolId);

    const notice = await Notice.create({
      title,
      content,
      category: category || 'General',
      priority: priority || 'Normal',
      targetAudience: Array.isArray(targetAudience) ? targetAudience : (targetAudience ? [targetAudience] : ['teacher', 'student', 'parent']),
      schoolIds: normalizedSchoolIds,
      schoolId: normalizedSchoolIds[0] || null,
      postedBy: req.user.id,
      expiresAt: expiresAt || null,
    });

    const populated = await Notice.findById(notice._id)
      .populate('postedBy', 'name role')
      .populate('schoolId', 'name')
      .populate('schoolIds', 'name');

    // ✅ Push notifications पाठव
    try {
      await notifyNewNotice(populated);
    } catch (err) {
      console.error('Notice notify failed:', err.message);
    }

    res.status(201).json({
      success: true,
      message: '✅ Notice published',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Notice update
// @route   PUT /api/notices/:id
export const updateNotice = async (req, res) => {
  try {
    const body = req.body || {};

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notice ID',
      });
    }

    const notice = await Notice.findOne({
      _id: req.params.id,
      isActive: true,
    });

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice सापडला नाही',
      });
    }

    const fields = ['title', 'content', 'category', 'priority'];
    let hasUpdate = false;
    for (const field of fields) {
      if (body[field] !== undefined) {
        notice[field] = body[field];
        hasUpdate = true;
      }
    }

    if (body.targetAudience !== undefined) {
      notice.targetAudience = Array.isArray(body.targetAudience)
        ? body.targetAudience
        : [body.targetAudience];
      hasUpdate = true;
    }

    if (body.schoolIds !== undefined || body.schoolId !== undefined) {
      const nextSchoolIds = normalizeSchoolIds(body.schoolIds ?? body.schoolId);
      notice.schoolIds = nextSchoolIds;
      notice.schoolId = nextSchoolIds[0] || null;
      hasUpdate = true;
    }

    if (body.expiresAt !== undefined) {
      notice.expiresAt = body.expiresAt || null;
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return res.status(400).json({
        success: false,
        message: 'किमान एक field update करा',
      });
    }

    await notice.save();
    await notice.populate([
      { path: 'postedBy', select: 'name role' },
      { path: 'schoolId', select: 'name' },
      { path: 'schoolIds', select: 'name' },
    ]);

    res.status(200).json({
      success: true,
      message: '✅ Notice updated',
      data: notice,
    });
  } catch (error) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Notice delete (soft)
// @route   DELETE /api/notices/:id
export const deleteNotice = async (req, res) => {
  try {
    const notice = await Notice.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice सापडला नाही',
      });
    }

    res.status(200).json({
      success: true,
      message: '✅ Notice deleted',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};