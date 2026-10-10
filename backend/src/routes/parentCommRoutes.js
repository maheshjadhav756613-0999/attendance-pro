import express from 'express';
import {
  logCommunication,
  getStudentCommunications,
  getMyCommunications,
  getAllCommunications,
  updateCommunication,
  deleteCommunication,
  getNaacReport,
} from '../controllers/parentCommController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize('teacher', 'admin'), logCommunication);
router.get('/my', authorize('teacher'), getMyCommunications);
router.get('/all', authorize('admin'), getAllCommunications);
router.get('/naac-report', authorize('admin'), getNaacReport);
router.get('/student/:studentId', getStudentCommunications);
router.put('/:id', updateCommunication);
router.delete('/:id', authorize('admin'), deleteCommunication);

export default router;