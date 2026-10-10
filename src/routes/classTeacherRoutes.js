import express from 'express';
import {
  getSchoolClasses,
  getSchoolTeachers,
  addTeacher,
  updateTeacher,
  deleteTeacher,
  getNextTeacherId,
} from '../controllers/classTeacherController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/classes', getSchoolClasses);
router.get('/teachers', getSchoolTeachers);
router.post('/teachers', addTeacher);
router.put('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);
router.get('/next-teacher-id', getNextTeacherId);

export default router;