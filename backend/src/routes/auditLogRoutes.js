import express from 'express';
import {
  getAuditLogs,
  getStudentAuditLogs,
  getTeacherAuditLogs,
  getAuditStats,
} from '../../../backend/src/controllers/auditLogController.js';
import { protect, authorize } from '../../../backend/src/middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/', getAuditLogs);
router.get('/stats', getAuditStats);
router.get('/student/:studentId', getStudentAuditLogs);
router.get('/teacher/:teacherId', getTeacherAuditLogs);

export default router;