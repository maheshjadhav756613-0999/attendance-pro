import express from 'express';
import {
  getMyClassTeacherClasses,
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getAvailableTeachers,
  assignSubjectToTeacher,
  removeSubjectTeacher,
} from '../controllers/teacherSubjectController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('teacher'));

router.get('/my-classes', getMyClassTeacherClasses);
router.get('/', getSubjects);
router.post('/', createSubject);
router.put('/:id', updateSubject);
router.delete('/:id', deleteSubject);
router.get('/available-teachers', getAvailableTeachers);
router.post('/assign', assignSubjectToTeacher);
router.delete('/remove-assignment', removeSubjectTeacher);

export default router;