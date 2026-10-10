import express from 'express';
import {
  getTeacherOverview,
  getClassAttendanceReport,
  getStudentReport,
} from '../controllers/teacherReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/overview', getTeacherOverview);
router.get('/class', getClassAttendanceReport);
router.get('/student/:studentId', getStudentReport);

export default router;