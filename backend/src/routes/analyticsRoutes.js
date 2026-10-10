import express from 'express';
import {
  getNaacOverview,
  getMonthlyTrend,
  getProgrammeWise,
  getClassWise,
  getGenderWise,
  getCategoryWise,
  getSubjectWise,
  getDefaulters,
  getYearComparison,
} from '../controllers/analyticsController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/naac-overview', getNaacOverview);
router.get('/monthly-trend', getMonthlyTrend);
router.get('/programme-wise', getProgrammeWise);
router.get('/class-wise', getClassWise);
router.get('/gender-wise', getGenderWise);
router.get('/category-wise', getCategoryWise);
router.get('/subject-wise', getSubjectWise);
router.get('/defaulters', getDefaulters);
router.get('/year-comparison', getYearComparison);

export default router;