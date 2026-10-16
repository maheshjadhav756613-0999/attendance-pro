import Submission from '../models/Submission.js';
import Assignment from '../models/Assignment.js';
import Student from '../models/Student.js';
import User from '../models/User.js';

// ============================================
// @desc    Student — Assignment submit
// @route   POST /api/submissions/:assignmentId
// ============================================
export const submitAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { submissionType, physicalNote, studentRemark } = req.body;

    // Student शोध
    const student = await Student.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    // Assignment
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment सापडली नाही',
      });
    }

    // Duplicate check
    const existing = await Submission.findOne({
      assignmentId,
      studentId: student._id,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'आधीच submit केले आहे',
      });
    }

    // Late check
    const isLate = new Date() > new Date(assignment.dueDate);
    if (isLate && !assignment.allowLateSubmission) {
      return res.status(400).json({
        success: false,
        message: 'Late submission allowed नाही',
      });
    }

    // Files
    const files = (req.files || []).map((f) => ({
      fileName: f.originalname,
      fileUrl: `/uploads/submissions/${f.filename}`,
      fileType: f.mimetype,
      fileSize: f.size,
    }));

    const submission = await Submission.create({
      assignmentId,
      studentId: student._id,
      classId: assignment.classId,
      divisionName: assignment.divisionName,
      submissionType: submissionType || 'Online',
      files,
      physicalNote: physicalNote?.trim() || '',
      studentRemark: studentRemark?.trim() || '',
      submittedAt: new Date(),
      isLate,
      status: 'Pending',
    });

    console.log(
      `📤 Submission: ${student.name} → ${assignment.title} (${submissionType})`
    );

    res.status(201).json({
      success: true,
      message: isLate
        ? '⚠️ Late submission — Teacher approval लागेल'
        : '✅ Assignment submit झाली',
      data: submission,
    });
  } catch (error) {
    console.error('🔥 SUBMIT ASSIGNMENT ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'आधीच submit केले आहे',
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student — स्वतःच्या submissions
// @route   GET /api/submissions/my
// ============================================
export const getMySubmissions = async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.user.id });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const submissions = await Submission.find({
      studentId: student._id,
    })
      .populate({
        path: 'assignmentId',
        populate: [
          { path: 'subjectId', select: 'name code' },
          { path: 'teacherId', select: 'name teacherId' },
        ],
      })
      .populate('reviewedBy', 'name teacherId')
      .sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      count: submissions.length,
      data: submissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — एक submission ची details
// @route   GET /api/submissions/:id
// ============================================
export const getSubmissionDetail = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('studentId', 'name studentId rollNumber prnNumber email mobile')
      .populate({
        path: 'assignmentId',
        populate: [
          { path: 'subjectId', select: 'name code' },
          { path: 'classId', select: 'name academicYear' },
        ],
      })
      .populate('reviewedBy', 'name teacherId');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission सापडली नाही',
      });
    }

    // Verify — हा teacher या assignment चा owner आहे का?
    if (
      submission.assignmentId?.teacherId?.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access नाही',
      });
    }

    res.status(200).json({ success: true, data: submission });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — Submission approve/reject
// @route   PUT /api/submissions/:id/review
// ============================================
export const reviewSubmission = async (req, res) => {
  try {
    const { status, marks, teacherRemark } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status Approved किंवा Rejected असावा',
      });
    }

    const submission = await Submission.findById(req.params.id).populate(
      'assignmentId',
      'teacherId title totalMarks'
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission सापडली नाही',
      });
    }

    if (
      submission.assignmentId?.teacherId?.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'तू या assignment चा owner नाही',
      });
    }

    if (submission.status !== 'Pending') {
      return res.status(400).json({
        success: false,
        message: `Submission आधीच ${submission.status} आहे`,
      });
    }

    submission.status = status;
    submission.marks = marks !== undefined && marks !== '' ? Number(marks) : null;
    submission.teacherRemark = teacherRemark?.trim() || '';
    submission.reviewedBy = req.user.id;
    submission.reviewedAt = new Date();
    await submission.save();

    console.log(
      `✅ Submission ${status}: ${submission.assignmentId?.title}`
    );

    res.status(200).json({
      success: true,
      message: `✅ Submission ${status === 'Approved' ? 'Approved' : 'Rejected'}`,
      data: submission,
    });
  } catch (error) {
    console.error('🔥 REVIEW SUBMISSION ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — Pending submissions count (badge)
// @route   GET /api/submissions/pending-count
// ============================================
export const getPendingSubmissionsCount = async (req, res) => {
  try {
    // Teacher च्या सगळ्या assignments
    const assignments = await Assignment.find({
      teacherId: req.user.id,
      isActive: true,
    }).select('_id');

    const assignmentIds = assignments.map((a) => a._id);

    const count = await Submission.countDocuments({
      assignmentId: { $in: assignmentIds },
      status: 'Pending',
    });

    res.status(200).json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — Pending submissions list
// @route   GET /api/submissions/pending
// ============================================
export const getPendingSubmissions = async (req, res) => {
  try {
    const assignments = await Assignment.find({
      teacherId: req.user.id,
      isActive: true,
    }).select('_id');

    const assignmentIds = assignments.map((a) => a._id);

    const submissions = await Submission.find({
      assignmentId: { $in: assignmentIds },
      status: 'Pending',
    })
      .populate('studentId', 'name studentId rollNumber')
      .populate({
        path: 'assignmentId',
        select: 'title dueDate totalMarks subjectId',
        populate: { path: 'subjectId', select: 'name code' },
      })
      .sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      count: submissions.length,
      data: submissions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};