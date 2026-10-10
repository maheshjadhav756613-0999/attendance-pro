import express from 'express';
import {
  getOverview,
  getTeacherReport,
  getClassReport,
  getSubjectReport,
  getSchoolReport,
  getLectureReport, // ✅ new
} from '../controllers/reportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/overview', getOverview);
router.get('/teachers', getTeacherReport);
router.get('/classes', getClassReport);
router.get('/subjects', getSubjectReport);
router.get('/schools', getSchoolReport);
router.get('/lectures', getLectureReport); // ✅ new

export default router;