import express from 'express';
import {
  getHolidays,
  getHoliday,
  createHoliday,
  createBulkHolidays,
  updateHoliday,
  deleteHoliday,
} from '../controllers/holidayController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// ✅ GET routes — both teachers and admins can use these
router.get('/', getHolidays);
router.get('/:id', getHoliday);

// Admin-only routes
router.post('/', authorize('admin'), createHoliday);
router.post('/bulk', authorize('admin'), createBulkHolidays);
router.put('/:id', authorize('admin'), updateHoliday);
router.delete('/:id', authorize('admin'), deleteHoliday);

export default router;