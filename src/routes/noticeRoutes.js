import express from 'express';
import {
  getNotices,
  createNotice,
  deleteNotice,
} from '../../../backend/src/controllers/noticeController.js';
import { protect, authorize } from '../../../backend/src/middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getNotices)
  .post(authorize('admin'), createNotice);

router.delete('/:id', authorize('admin'), deleteNotice);

export default router;