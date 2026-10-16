import express from 'express';
import { getStudentNotifications } from '../controllers/studentNotificationController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('student'));

router.get('/', getStudentNotifications);

export default router;