import express from 'express';
import {
  getSubjects,
  getSubject,
  createSubject,
  createBulkSubjects,
  updateSubject,
  deleteSubject,
} from '../controllers/subjectController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.route('/').get(getSubjects).post(createSubject);
router.post('/bulk', createBulkSubjects);
router.route('/:id').get(getSubject).put(updateSubject).delete(deleteSubject);

export default router;