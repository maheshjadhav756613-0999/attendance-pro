import express from 'express';
import {
  createAssignment,
  getTeacherAssignments,
  getAssignmentDetail,
  deleteAssignment,
  getStudentAssignments,
  getParentAssignments,
} from '../controllers/assignmentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { uploadFiles } from '../middleware/upload.js';

const router = express.Router();

router.use(protect);

// Teacher routes
router.post('/', authorize('teacher'), uploadFiles('attachments'), createAssignment);
router.get('/teacher', authorize('teacher'), getTeacherAssignments);
router.delete('/:id', authorize('teacher'), deleteAssignment);

// Student routes
router.get('/student', authorize('student'), getStudentAssignments);

// Parent routes
router.get('/parent', authorize('parent'), getParentAssignments);

// Common — एक assignment
router.get('/:id', getAssignmentDetail);

export default router;