import express from 'express';
import {
  getNotices,
  createNotice,
  updateNotice,
  deleteNotice,
} from '../controllers/noticeController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getNotices)
  .post(authorize('admin'), createNotice);

router.put('/:id', authorize('admin'), updateNotice);
router.delete('/:id', authorize('admin'), deleteNotice);

export default router;