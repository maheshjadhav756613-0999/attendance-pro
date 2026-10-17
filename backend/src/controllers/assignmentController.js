import Assignment from '../models/Assignment.js';
import Submission from '../models/Submission.js';
import User from '../models/User.js';
import Student from '../models/Student.js';
import {
  deleteStoredFiles,
  signAssignmentFiles,
  signSubmissionFiles,
  uploadRequestFiles,
} from '../utils/assignmentFileUrls.js';

// ============================================
// HELPER: Teacher हा या class+division मध्ये आहे का?
// ============================================
const isTeacherOfClass = (teacher, classId, divisionName) => {
  if (!teacher || !teacher.assignments) return false;
  return teacher.assignments.some((a) => {
    const aClassId = (a.classId?._id || a.classId)?.toString();
    return (
      aClassId === classId?.toString() &&
      a.divisionName === divisionName?.toUpperCase()
    );
  });
};

// ============================================
// @desc    Teacher — Assignment create
// @route   POST /api/assignments
// ============================================
export const createAssignment = async (req, res) => {
  let attachments = [];
  let assignmentSaved = false;
  try {
    const teacher = await User.findById(req.user.id);
    const {
      schoolId,
      classId,
      divisionName,
      subjectId,
      title,
      description,
      instructions,
      dueDate,
      totalMarks,
      submissionType,
      allowLateSubmission,
    } = req.body;

    // Validation
    if (!schoolId || !classId || !divisionName || !subjectId || !title || !dueDate) {
      return res.status(400).json({
        success: false,
        message: 'सगळी आवश्यक fields भरा',
      });
    }

    if (!isTeacherOfClass(teacher, classId, divisionName)) {
      return res.status(403).json({
        success: false,
        message: 'तू या class+division ला assigned नाही',
      });
    }

    attachments = await uploadRequestFiles(
      req.files || [],
      schoolId,
      classId,
      'assignments'
    );

    const assignment = await Assignment.create({
      teacherId: req.user.id,
      schoolId,
      classId,
      divisionName: divisionName.toUpperCase(),
      subjectId,
      title: title.trim(),
      description: description?.trim() || '',
      instructions: instructions?.trim() || '',
      attachments,
      assignedDate: new Date(),
      dueDate: new Date(dueDate),
      totalMarks: totalMarks ? Number(totalMarks) : 0,
      submissionType: submissionType || 'Both',
      allowLateSubmission: allowLateSubmission === 'true' || allowLateSubmission === true,
    });
    assignmentSaved = true;

    console.log(`📚 Assignment created: ${title}`);

    const populated = await Assignment.findById(assignment._id)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('teacherId', 'name teacherId');

    res.status(201).json({
      success: true,
      message: '✅ Assignment create झाली',
      data: await signAssignmentFiles(populated),
    });
  } catch (error) {
    if (!assignmentSaved && attachments.length) {
      try {
        await deleteStoredFiles(attachments);
      } catch (cleanupError) {
        console.error('🔥 ASSIGNMENT FILE CLEANUP ERROR:', cleanupError);
      }
    }
    console.error('🔥 CREATE ASSIGNMENT ERROR:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — आपल्या assignments list
// @route   GET /api/assignments/teacher
// ============================================
export const getTeacherAssignments = async (req, res) => {
  try {
    const { classId, division, subjectId } = req.query;

    const filter = {
      teacherId: req.user.id,
      isActive: true,
    };

    if (classId) filter.classId = classId;
    if (division) filter.divisionName = division.toUpperCase();
    if (subjectId) filter.subjectId = subjectId;

    const assignments = await Assignment.find(filter)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code')
      .sort({ dueDate: -1 });

    // प्रत्येक assignment चे submission count
    const result = await Promise.all(
      assignments.map(async (a) => {
        const totalStudents = await Student.countDocuments({
          classId: a.classId,
          divisionName: a.divisionName,
          isActive: true,
        });
        const submitted = await Submission.countDocuments({
          assignmentId: a._id,
        });
        const approved = await Submission.countDocuments({
          assignmentId: a._id,
          status: 'Approved',
        });
        const pending = await Submission.countDocuments({
          assignmentId: a._id,
          status: 'Pending',
        });

        return signAssignmentFiles({
          ...a.toObject(),
          totalStudents,
          submitted,
          notSubmitted: totalStudents - submitted,
          approved,
          pending,
        });
      })
    );

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error('🔥 GET TEACHER ASSIGNMENTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    एक assignment ची details
// @route   GET /api/assignments/:id
// ============================================
export const getAssignmentDetail = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('subjectId', 'name code')
      .populate('classId', 'name academicYear')
      .populate('schoolId', 'name code')
      .populate('teacherId', 'name teacherId');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment सापडली नाही',
      });
    }

    // सगळे submissions
    const submissions = await Submission.find({
      assignmentId: req.params.id,
    })
      .populate('studentId', 'name studentId rollNumber seatNumber prnNumber email mobile')
      .populate('reviewedBy', 'name teacherId')
      .sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        assignment: await signAssignmentFiles(assignment),
        submissions: await Promise.all(submissions.map(signSubmissionFiles)),
      },
    });
  } catch (error) {
    console.error('🔥 GET ASSIGNMENT DETAIL ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Teacher — Assignment delete
// @route   DELETE /api/assignments/:id
// ============================================
export const deleteAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      teacherId: req.user.id,
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment सापडली नाही',
      });
    }

    assignment.isActive = false;
    await assignment.save();

    res.status(200).json({
      success: true,
      message: '✅ Assignment delete झाली',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Student — Assignment list (सगळी)
// @route   GET /api/assignments/student
// ============================================
export const getStudentAssignments = async (req, res) => {
  try {
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

    const assignments = await Assignment.find({
      classId: student.classId,
      divisionName: student.divisionName,
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name teacherId')
      .sort({ dueDate: -1 });

    // प्रत्येक assignment साठी submission status
    const result = await Promise.all(
      assignments.map(async (a) => {
        const submission = await Submission.findOne({
          assignmentId: a._id,
          studentId: student._id,
        }).populate('reviewedBy', 'name teacherId');

        const now = new Date();
        const dueDate = new Date(a.dueDate);
        const isOverdue = now > dueDate;

        return {
          ...a.toObject(),
          attachments: (await signAssignmentFiles(a)).attachments,
          submission: submission ? await signSubmissionFiles(submission) : null,
          submitted: !!submission,
          isOverdue,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
      student: {
        _id: student._id,
        name: student.name,
        classId: student.classId,
        divisionName: student.divisionName,
      },
    });
  } catch (error) {
    console.error('🔥 GET STUDENT ASSIGNMENTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Parent — Child च्या assignments
// @route   GET /api/assignments/parent
// ============================================
export const getParentAssignments = async (req, res) => {
  try {
    // Parent चे मूल शोध
    const parent = await User.findById(req.user.id);
    if (!parent || !parent.studentId) {
      return res.status(404).json({
        success: false,
        message: 'Parent चा student link नाही',
      });
    }

    const student = await Student.findById(parent.studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student सापडला नाही',
      });
    }

    const assignments = await Assignment.find({
      classId: student.classId,
      divisionName: student.divisionName,
      isActive: true,
    })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name teacherId')
      .sort({ dueDate: -1 });

    const result = await Promise.all(
      assignments.map(async (a) => {
        const submission = await Submission.findOne({
          assignmentId: a._id,
          studentId: student._id,
        }).populate('reviewedBy', 'name teacherId');

        const now = new Date();
        const dueDate = new Date(a.dueDate);
        const isOverdue = now > dueDate;

        return {
          ...a.toObject(),
          attachments: (await signAssignmentFiles(a)).attachments,
          submission: submission ? await signSubmissionFiles(submission) : null,
          submitted: !!submission,
          isOverdue,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
      student: {
        _id: student._id,
        name: student.name,
        classId: student.classId,
        divisionName: student.divisionName,
      },
    });
  } catch (error) {
    console.error('🔥 GET PARENT ASSIGNMENTS ERROR:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};