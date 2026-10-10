import express from 'express';
import {
  createRemedial,
  getMyRemedials,
  getAllRemedials,
  markAttendance,
  updateRemedialStatus,
  getRemedialReport,
  deleteRemedial,
} from '../controllers/remedialController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize('teacher'), createRemedial);
router.get('/my', authorize('teacher'), getMyRemedials);
router.get('/all', authorize('admin'), getAllRemedials);
router.get('/naac-report', authorize('admin'), getRemedialReport);
router.put('/:id/mark', authorize('teacher'), markAttendance);
router.put('/:id/status', authorize('teacher'), updateRemedialStatus);
router.delete('/:id', authorize('admin', 'teacher'), deleteRemedial);

export default router;