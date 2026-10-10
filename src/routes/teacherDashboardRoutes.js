import express from 'express';
import { getTeacherDashboard, getPendingLectures } from '../controllers/teacherDashboardController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/', getTeacherDashboard);
router.get('/pending', getPendingLectures);  // ✅ नवीन

export default router;