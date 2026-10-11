import webPush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import User from '../models/User.js';
import Student from '../models/Student.js';

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

const normalizeSchoolIds = (schoolIds) => {
  const normalized = Array.isArray(schoolIds)
    ? schoolIds
    : schoolIds
      ? [schoolIds]
      : [];

  return [...new Set(normalized.filter(Boolean).map((id) => String(id)))];
};

const getRoleUserIdsForSchoolIds = async (role, schoolIds) => {
  const normalized = normalizeSchoolIds(schoolIds);
  if (!normalized.length || role === 'admin') return [];

  if (role === 'teacher') {
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      assignments: {
        $elemMatch: {
          schoolId: { $in: normalized },
        },
      },
    }).select('_id');
    return teachers.map((user) => user._id.toString());
  }

  if (role === 'student') {
    const students = await Student.find({
      schoolId: { $in: normalized },
      isActive: true,
    }).select('userId');
    return students
      .map((student) => student.userId?.toString())
      .filter(Boolean);
  }

  if (role === 'parent') {
    const students = await Student.find({
      schoolId: { $in: normalized },
      isActive: true,
    }).select('parentUserId');
    return students
      .map((student) => student.parentUserId?.toString())
      .filter(Boolean);
  }

  return [];
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

export const sendPushToRoleInSchools = async (role, schoolIds, payload) => {
  const normalized = normalizeSchoolIds(schoolIds);

  if (!normalized.length) {
    return sendPushToRole(role, payload);
  }

  const userIds = await getRoleUserIdsForSchoolIds(role, normalized);
  return sendPushToUsers(userIds, payload);
};

export const sendPushToUsers = async (userIds, payload) => {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean).map((id) => String(id)))];

  if (!uniqueUserIds.length) {
    return { sent: 0, expired: 0 };
  }

  const subscriptions = await PushSubscription.find({
    userId: { $in: uniqueUserIds },
    isActive: true,
  }).select('_id subscription');

  return sendToSubscriptions(subscriptions, payload);
};
