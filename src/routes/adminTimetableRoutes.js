import express from 'express';
import {
  getClassesForTimetable,
  getClassTimetableForAdmin,
  getClassTeachersList,
  getTeacherTimetableForAdmin,
  getTeachersForTimetable,
} from '../controllers/adminTimetableController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

// Class-wise
router.get('/classes', getClassesForTimetable);
router.get('/class/:classId/:division', getClassTimetableForAdmin);

// Class Teacher-wise
router.get('/class-teachers', getClassTeachersList);

// Teacher-wise
router.get('/teachers', getTeachersForTimetable);
router.get('/teacher/:teacherId', getTeacherTimetableForAdmin);

export default router;