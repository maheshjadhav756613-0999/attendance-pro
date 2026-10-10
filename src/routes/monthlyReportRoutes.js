import express from 'express';
import {
  getClassMonthlyReport,
  getWeeklyBreakdown,
} from '../controllers/monthlyReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.get('/class', getClassMonthlyReport);
router.get('/weekly', getWeeklyBreakdown);

export default router;