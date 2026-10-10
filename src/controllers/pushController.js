import PushSubscription from '../models/PushSubscription.js';
import { sendPushToUser } from '../services/pushService.js';

// ============================================
// @desc    Get VAPID Public Key (Frontend साठी)
// @route   GET /api/push/vapid-public-key
// ============================================
export const getVapidPublicKey = (req, res) => {
  res.status(200).json({
    success: true,
    publicKey: process.env.VAPID_PUBLIC_KEY,
  });
};

// ============================================
// @desc    Subscribe to push notifications
// @route   POST /api/push/subscribe
// ============================================
export const subscribe = async (req, res) => {
  try {
    const { subscription, deviceInfo } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Subscription data आवश्यक',
      });
    }

    // Check if already exists
    const existing = await PushSubscription.findOne({
      userId: req.user.id,
      'subscription.endpoint': subscription.endpoint,
    });

    if (existing) {
      // Update
      existing.subscription = subscription;
      existing.deviceInfo = deviceInfo || existing.deviceInfo;
      existing.isActive = true;
      existing.lastUsed = new Date();
      await existing.save();

      return res.status(200).json({
        success: true,
        message: '✅ Subscription updated',
        data: existing,
      });
    }

    // Create new
    const newSubscription = await PushSubscription.create({
      userId: req.user.id,
      role: req.user.role,
      subscription,
      deviceInfo: deviceInfo || {},
    });

    console.log(
      `✅ New push subscription: ${req.user.name} (${req.user.role})`
    );

    // Send welcome notification
    await sendPushToUser(req.user.id, {
      title: '🎓 AttendancePro',
      body: 'Notifications enabled! तुला आता सगळ्या updates मिळतील.',
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: 'welcome',
      data: { url: '/' },
    });

    res.status(201).json({
      success: true,
      message: '✅ Notifications enabled!',
      data: newSubscription,
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Unsubscribe
// @route   POST /api/push/unsubscribe
// ============================================
export const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Endpoint आवश्यक',
      });
    }

    await PushSubscription.findOneAndUpdate(
      {
        userId: req.user.id,
        'subscription.endpoint': endpoint,
      },
      { isActive: false }
    );

    res.status(200).json({
      success: true,
      message: '✅ Notifications disabled',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Get user's active subscriptions
// @route   GET /api/push/my-subscriptions
// ============================================
export const getMySubscriptions = async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find({
      userId: req.user.id,
      isActive: true,
    }).select('deviceInfo lastUsed createdAt subscription.endpoint');

    res.status(200).json({
      success: true,
      count: subscriptions.length,
      data: subscriptions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Get active subscription counts by role
// @route   GET /api/push/debug/all
// ============================================
export const getSubscriptionStats = async (req, res) => {
  try {
    const roleCounts = await PushSubscription.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
    const byRole = {
      admin: 0,
      teacher: 0,
      student: 0,
      parent: 0,
    };

    for (const { _id, count } of roleCounts) {
      if (Object.hasOwn(byRole, _id)) {
        byRole[_id] = count;
      }
    }

    res.status(200).json({
      success: true,
      total: Object.values(byRole).reduce((sum, count) => sum + count, 0),
      byRole,
    });
  } catch (error) {
    console.error('Push subscription stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// @desc    Test notification
// @route   POST /api/push/test
// ============================================
export const testNotification = async (req, res) => {
  try {
    const result = await sendPushToUser(req.user.id, {
      title: '🔔 Test Notification',
      body: 'हा एक test notification आहे! सगळं बरोबर चालू आहे.',
      icon: '/logo192.png',
      badge: '/badge.png',
      tag: 'test',
      data: { url: '/' },
    });

    res.status(200).json({
      success: true,
      message: 'Test notification sent',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};