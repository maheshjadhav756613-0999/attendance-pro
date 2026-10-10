import express from 'express';
import {
  getTeacherProfile,
  updateTeacherProfile,
  changeTeacherPassword,
} from '../controllers/teacherSettingsController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/profile', getTeacherProfile);
router.put('/profile', updateTeacherProfile);
router.put('/change-password', changeTeacherPassword);

export default router;