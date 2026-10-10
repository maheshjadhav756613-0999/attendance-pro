import express from 'express';
import {
  getTeachers,
  getTeacher,
  createTeacher,
  createBulkTeachers,
  updateTeacher,
  deleteTeacher,
  resetTeacherPassword,
} from '../controllers/teacherController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.route('/').get(getTeachers).post(createTeacher);
router.post('/bulk', createBulkTeachers);
router.route('/:id').get(getTeacher).put(updateTeacher).delete(deleteTeacher);
router.put('/:id/reset-password', resetTeacherPassword);

export default router;