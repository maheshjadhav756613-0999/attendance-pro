import express from 'express';
import {
  getMyTimetables,
  getTeacherHolidays,
  getTimetableByClass,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  updateLecture,
  deleteLecture,
  getLectures,
  getLecturesByDay,
  getFullClassTimetable,
  getFullClassLectures,
  cancelLecture,
} from '../controllers/timetableController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

// ⚠️ ORDER important — specific routes first, dynamic routes last

// Static / Specific routes
router.get('/my', getMyTimetables);
router.get('/holidays', getTeacherHolidays);
router.get('/lectures', getLectures);
router.get('/lectures/day', getLecturesByDay);
router.get('/lectures/full-class', getFullClassLectures);
router.get('/full-class', getFullClassTimetable);

// Lecture operations (specific routes first)
router.put('/lecture/:id', updateLecture);
router.delete('/lecture/:id', deleteLecture);

// Timetable CRUD (general routes last)
router.get('/class/:classId/:division', getTimetableByClass);
router.post('/', createTimetable);
router.put('/:id', updateTimetable);
router.delete('/:id', deleteTimetable);
router.put('/lecture/:id/cancel', cancelLecture);
export default router;