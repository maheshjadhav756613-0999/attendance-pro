import express from 'express';
import {
  submitAssignment,
  getMySubmissions,
  getSubmissionDetail,
  reviewSubmission,
  getPendingSubmissionsCount,
  getPendingSubmissions,
} from '../controllers/submissionController.js';
import { protect, authorize } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(protect);

// Student routes
router.post(
  '/:assignmentId',
  authorize('student'),
  (req, res, next) => {
    req.uploadType = 'submission';
    next();
  },
  upload.array('files', 5),
  submitAssignment
);
router.get('/my', authorize('student'), getMySubmissions);

// Teacher routes
router.get(
  '/pending-count',
  authorize('teacher'),
  getPendingSubmissionsCount
);
router.get('/pending', authorize('teacher'), getPendingSubmissions);
router.put('/:id/review', authorize('teacher'), reviewSubmission);
router.get('/:id', authorize('teacher'), getSubmissionDetail);

export default router;