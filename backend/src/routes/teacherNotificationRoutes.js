import express from 'express';
import { getTeacherNotifications } from '../controllers/teacherNotificationController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/', getTeacherNotifications);

export default router;