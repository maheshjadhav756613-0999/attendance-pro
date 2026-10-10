import AttendanceAuditLog from '../models/AttendanceAuditLog.js';

// @desc    Get all audit logs (paginated)
// @route   GET /api/audit-log?page=1&limit=50
export const getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};

    // Filters
    if (req.query.action) filter.action = req.query.action;
    if (req.query.teacherId) filter.editedBy = req.query.teacherId;
    if (req.query.studentId) filter.studentId = req.query.studentId;

    if (req.query.fromDate || req.query.toDate) {
      filter.createdAt = {};
      if (req.query.fromDate) {
        filter.createdAt.$gte = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        const endDate = new Date(req.query.toDate);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      AttendanceAuditLog.find(filter)
        .populate('editedBy', 'name teacherId role')
        .populate('studentId', 'name rollNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AttendanceAuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: logs.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (error) {
    console.error('🔥 AUDIT LOG ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get audit log for specific student
// @route   GET /api/audit-log/student/:studentId
export const getStudentAuditLogs = async (req, res) => {
  try {
    const logs = await AttendanceAuditLog.find({
      studentId: req.params.studentId,
    })
      .populate('editedBy', 'name teacherId')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get audit log for specific teacher
// @route   GET /api/audit-log/teacher/:teacherId
export const getTeacherAuditLogs = async (req, res) => {
  try {
    const logs = await AttendanceAuditLog.find({
      editedBy: req.params.teacherId,
    })
      .populate('studentId', 'name rollNumber')
      .sort({ createdAt: -1 })
      .limit(200);

    res.status(200).json({
      success: true,
      count: logs.length,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get audit stats
// @route   GET /api/audit-log/stats
export const getAuditStats = async (req, res) => {
  try {
    const [total, creates, updates, deletes] = await Promise.all([
      AttendanceAuditLog.countDocuments(),
      AttendanceAuditLog.countDocuments({ action: 'create' }),
      AttendanceAuditLog.countDocuments({ action: 'update' }),
      AttendanceAuditLog.countDocuments({ action: 'delete' }),
    ]);

    // Last 7 days trend
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const trend = await AttendanceAuditLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            action: '$action',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        creates,
        updates,
        deletes,
        trend,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};