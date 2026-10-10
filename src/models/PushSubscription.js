import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student', 'parent'],
      required: true,
    },
    subscription: {
      endpoint: { type: String, required: true },
      keys: {
        p256dh: { type: String, required: true },
        auth: { type: String, required: true },
      },
    },
    deviceInfo: {
      userAgent: String,
      platform: String,
      device: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// एक user + endpoint = unique
pushSubscriptionSchema.index(
  { userId: 1, 'subscription.endpoint': 1 },
  { unique: true }
);

const PushSubscription = mongoose.model(
  'PushSubscription',
  pushSubscriptionSchema
);

export default PushSubscription;