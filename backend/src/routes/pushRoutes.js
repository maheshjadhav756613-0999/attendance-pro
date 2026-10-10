import express from 'express';
import {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  getMySubscriptions,
  getSubscriptionStats,
  testNotification,
} from '../controllers/pushController.js';
import { authorize, protect } from '../middleware/auth.js';

const router = express.Router();

// Public route (no auth needed)
router.get('/vapid-public-key', getVapidPublicKey);

// Protected routes
router.use(protect);
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);
router.get('/my-subscriptions', getMySubscriptions);
router.get('/debug/all', authorize('admin'), getSubscriptionStats);
router.post('/test', testNotification);

export default router;