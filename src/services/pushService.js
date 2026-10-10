import webPush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

let configuredVapidDetails;

const ensureVapidConfiguration = () => {
  const configuredSubject = process.env.VAPID_EMAIL;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!configuredSubject || !publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured');
  }

  const subject = /^(mailto:|https:\/\/)/i.test(configuredSubject)
    ? configuredSubject
    : `mailto:${configuredSubject}`;
  const currentDetails = `${subject}:${publicKey}:${privateKey}`;
  if (configuredVapidDetails !== currentDetails) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    configuredVapidDetails = currentDetails;
  }
};

const sendToSubscriptions = async (subscriptions, payload) => {
  if (subscriptions.length === 0) {
    return { sent: 0, expired: 0 };
  }

  ensureVapidConfiguration();

  const results = await Promise.allSettled(
    subscriptions.map(async ({ _id, subscription }) => {
      try {
        await webPush.sendNotification(subscription, JSON.stringify(payload));
        return 'sent';
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.findByIdAndUpdate(_id, { isActive: false });
          return 'expired';
        }
        throw error;
      }
    })
  );

  const failures = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Failed to send push notification to ${failures.length} subscription(s)`
    );
  }

  return results.reduce(
    (counts, result) => {
      counts[result.value] += 1;
      return counts;
    },
    { sent: 0, expired: 0 }
  );
};

export const sendPushToUser = async (userId, payload) => {
  const subscriptions = await PushSubscription.find({
    userId,
    isActive: true,
  }).select('_id subscription');

  return sendToSubscriptions(subscriptions, payload);
};

export const sendPushToRole = async (role, payload) => {
  const subscriptions = await PushSubscription.find({
    role,
    isActive: true,
  }).select('_id subscription');

  return sendToSubscriptions(subscriptions, payload);
};

export const sendPushToUsers = async (userIds, payload) => {
  const subscriptions = await PushSubscription.find({
    userId: { $in: userIds },
    isActive: true,
  }).select('_id subscription');

  return sendToSubscriptions(subscriptions, payload);
};
