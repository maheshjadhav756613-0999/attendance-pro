import express from 'express';
import {
  getPTMs,
  getPTM,
  createPTM,
  updatePTM,
  deletePTM,
  assignSlot,
  getPTMSlots,
} from '../controllers/ptmController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Read access — Teacher + Admin
router.get('/', getPTMs);
router.get('/:id', getPTM);
router.get('/:id/slots', getPTMSlots);

// Admin only
router.use(authorize('admin'));
router.post('/', createPTM);
router.put('/:id', updatePTM);
router.delete('/:id', deletePTM);
router.post('/:id/assign-slot', assignSlot);

export default router;