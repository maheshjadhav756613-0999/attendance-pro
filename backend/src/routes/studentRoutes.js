import express from 'express';
import {
  getStudents,
  getStudent,
  getNextStudentId,
  createStudent,
  createBulkStudents,
  updateStudent,
  deleteStudent,
  resetStudentPasswords,
} from '../controllers/studentController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/', getStudents);
router.get('/next-id', getNextStudentId);
router.post('/', createStudent);
router.post('/bulk', createBulkStudents);
router.get('/:id', getStudent);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);
router.post('/:id/reset-passwords', resetStudentPasswords);

export default router;