import express from 'express';
import {
  applyLeave,
  getMyLeaves,
  getLeavesForClassTeacher,
  reviewLeave,
  getPendingLeavesCount,
} from '../controllers/leaveController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// ✅ Student + Parent दोघे apply करू शकतात
router.post('/', protect, authorize('student', 'parent'), applyLeave);
router.get('/my', protect, authorize('student', 'parent'), getMyLeaves);

// ✅ Teacher routes
router.get(
  '/class-teacher',
  protect,
  authorize('teacher'),
  getLeavesForClassTeacher
);
router.get(
  '/pending-count',
  protect,
  authorize('teacher'),
  getPendingLeavesCount
);
router.put('/:id/review', protect, authorize('teacher'), reviewLeave);

export default router;