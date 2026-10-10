import express from 'express';
import {
  getMyProfile,
  getMyAttendance,
  getMyLectures,
  getMyTimetable,
} from '../controllers/selfController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// ✅ Parent + Student दोघेही वापरू शकतात
router.get('/profile', getMyProfile);
router.get('/attendance', getMyAttendance);
router.get('/lectures', getMyLectures);
router.get('/timetable', getMyTimetable);

export default router;