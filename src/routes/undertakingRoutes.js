import express from 'express';
import {
  createUndertaking,
  getAllUndertakings,
  getStudentUndertakings,
  getUndertaking,
  signUndertaking,
  uploadSignedCopy,
  deleteUndertaking,
} from '../../../backend/src/controllers/undertakingController.js';
import { protect } from '../../../backend/src/middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', createUndertaking);
router.get('/', getAllUndertakings);
router.get('/student/:studentId', getStudentUndertakings);
router.get('/:id', getUndertaking);
router.put('/:id/sign', signUndertaking);
router.put('/:id/upload', uploadSignedCopy);
router.delete('/:id', deleteUndertaking);

export default router;