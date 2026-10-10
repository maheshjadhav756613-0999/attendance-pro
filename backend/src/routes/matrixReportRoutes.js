import express from 'express';
import { getMatrixReport } from '../controllers/matrixReportController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.get('/class', getMatrixReport);

export default router;