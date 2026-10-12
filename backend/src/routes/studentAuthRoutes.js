import express from 'express';
import {
  studentLogin,
  getCurrentStudent,
} from '../controllers/studentAuthController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', studentLogin);
router.get('/me', protect, authorize('student'), getCurrentStudent);

export default router;