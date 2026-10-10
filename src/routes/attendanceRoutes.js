import express from 'express';
import {
  getLectureAttendance,
  markBulkAttendance,
  editAttendance,
  bulkEditAttendance,
  getAttendanceHistory,
  getEditedAttendanceForLecture,
  getStudentMonthlyAttendance,
  getClassDailyAttendance,
  updateLectureStatus,
} from '../controllers/attendanceController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

// Lecture attendance
router.get('/lecture/:lectureId', getLectureAttendance);
router.get('/lecture/:lectureId/edited', getEditedAttendanceForLecture);

// Mark & Edit
router.post('/bulk', markBulkAttendance);
router.put('/bulk-edit', bulkEditAttendance);
router.put('/:id', editAttendance);
router.get('/:id/history', getAttendanceHistory);

// Lecture status
router.put('/lecture/:lectureId/status', updateLectureStatus);

// Reports
router.get('/student/:studentId/month/:month', getStudentMonthlyAttendance);
router.get('/class/:classId/:division/date/:date', getClassDailyAttendance);

export default router;