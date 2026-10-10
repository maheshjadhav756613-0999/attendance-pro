import express from 'express';
import {
  listBackups,
  createBackup,
  downloadBackup,
  downloadBackupById,
  getBackupStats,
  restoreBackup,
  deleteBackup,
} from '../../../backend/src/controllers/backupController.js';
import { protect, authorize } from '../../../backend/src/middleware/auth.js';

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

router.get('/list', listBackups);
router.get('/stats', getBackupStats);
router.get('/download', downloadBackup);
router.get('/download/:id', downloadBackupById);
router.post('/create', createBackup);
router.post('/restore/:id', restoreBackup);
router.delete('/:id', deleteBackup);

export default router;