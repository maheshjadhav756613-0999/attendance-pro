import express from 'express';
import {
  getProfile,
  updateProfile,
  changePassword,
  getSystemInfo,
} from '../controllers/settingsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.get('/system-info', getSystemInfo);

export default router;