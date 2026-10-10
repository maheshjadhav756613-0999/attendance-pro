import express from 'express';
import {
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  getExamEligibility,
  notifyEligibilityParents,
} from '../controllers/examController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Teacher + Admin दोघांनाही read access
router.get('/', getExams);
router.get('/:id', getExam);
router.get('/:id/eligibility', getExamEligibility);

// फक्त Admin ला CRUD
router.use(authorize('admin'));
router.post('/', createExam);
router.put('/:id', updateExam);
router.delete('/:id', deleteExam);
router.post('/:id/notify-parents', notifyEligibilityParents);

export default router;