import express from 'express';
import {
  getClasses,
  getClass,
  createClass,
  createBulkClasses, // ✅ नवीन
  updateClass,
  deleteClass,
} from '../controllers/classController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.route('/').get(getClasses).post(createClass);
router.post('/bulk', createBulkClasses); // ✅ specific आधी
router.route('/:id').get(getClass).put(updateClass).delete(deleteClass);

export default router;