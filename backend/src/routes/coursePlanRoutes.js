import express from 'express';
import {
  createOrUpdateCoursePlan,
  getMyCoursePlans,
  getCoursePlanById,
  updateWeekProgress,
  getAllCoursePlans,
  deleteCoursePlan,
} from '../controllers/coursePlanController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/my', authorize('teacher'), getMyCoursePlans);
router.get('/all', authorize('admin'), getAllCoursePlans);
router.get('/:id', getCoursePlanById);
router.post('/', authorize('teacher', 'admin'), createOrUpdateCoursePlan);
router.put(
  '/:id/week/:weekNumber',
  authorize('teacher'),
  updateWeekProgress
);
router.delete('/:id', authorize('admin'), deleteCoursePlan);

export default router;