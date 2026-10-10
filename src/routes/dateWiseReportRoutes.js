import express from 'express';
import {
  getDateWiseReportSubjects,
  getDateWiseReport,
  getStudentDateWiseReport,
} from '../controllers/dateWiseReportController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/subjects', getDateWiseReportSubjects);
router.get('/', getDateWiseReport);
router.get('/student/:studentId', getStudentDateWiseReport);

export default router;