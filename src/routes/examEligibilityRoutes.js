import express from 'express';
import {
  getClassEligibility,
  getAllEligibility,
} from '../controllers/examEligibilityController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.get('/class', getClassEligibility);
router.get('/all', getAllEligibility);

export default router;