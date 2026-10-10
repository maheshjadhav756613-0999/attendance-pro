import express from 'express';
import {
  getSchools,
  getSchool,
  createSchool,
  createBulkSchools, // ✅ नवीन
  updateSchool,
  deleteSchool,
} from '../controllers/schoolController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.route('/').get(getSchools).post(createSchool);
router.post('/bulk', createBulkSchools); // ✅ नवीन — specific आधी
router.route('/:id').get(getSchool).put(updateSchool).delete(deleteSchool);

export default router;