import { z } from 'zod';
import { NOTIFICATION_TYPES, PREFERENCE_KEYS } from '../../config/constants';
import { objectId, paginationQuery } from '../../validators/common';

export const registerDeviceSchema = z.object({
  fcmToken: z.string().min(20).max(4096),
  deviceId: z.string().min(4).max(128),
  platform: z.enum(['android', 'ios', 'web']),
  appVersion: z.string().max(32).optional(),
  osVersion: z.string().max(64).optional(),
});

export const deleteDeviceSchema = z.object({
  deviceId: z.string().min(4).max(128).optional(),
  fcmToken: z.string().min(20).max(4096).optional(),
}).refine((d) => d.deviceId || d.fcmToken, { message: 'deviceId or fcmToken required' });

export const sendNotificationSchema = z.object({
  userId: objectId,
  gymId: objectId.optional().nullable(),
  type: z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]).optional(),
  event: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  data: z.record(z.unknown()).optional(),
  force: z.boolean().optional(),
  dedupeKey: z.string().max(200).optional(),
});

export const bulkSendSchema = z.object({
  userIds: z.array(objectId).min(1).max(5000),
  gymId: objectId.optional().nullable(),
  type: z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]).optional(),
  event: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  data: z.record(z.unknown()).optional(),
  force: z.boolean().optional(),
  dedupeKey: z.string().max(200).optional(),
});

export const topicSendSchema = z.object({
  topic: z.string().min(2).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid topic'),
  type: z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]).optional(),
  event: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional().default(''),
  data: z.record(z.unknown()).optional(),
  gymId: objectId.optional().nullable(),
});

export const scheduleSchema = z.object({
  userId: objectId.optional(),
  userIds: z.array(objectId).max(5000).optional(),
  topic: z.string().min(2).max(128).optional(),
  gymId: objectId.optional().nullable(),
  type: z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]).optional(),
  event: z.string().min(1).max(128),
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional().default(''),
  data: z.record(z.unknown()).optional(),
  scheduledFor: z.coerce.date(),
  dedupeKey: z.string().max(200).optional(),
}).refine((d) => d.userId || (d.userIds && d.userIds.length) || d.topic, {
  message: 'userId, userIds, or topic required',
});

const prefBool = z.boolean().optional();

export const preferencesSchema = z.object({
  [PREFERENCE_KEYS.WORKOUT_REMINDER]: prefBool,
  [PREFERENCE_KEYS.DIET_REMINDER]: prefBool,
  [PREFERENCE_KEYS.MARKETING]: prefBool,
  [PREFERENCE_KEYS.OFFERS]: prefBool,
  [PREFERENCE_KEYS.ATTENDANCE]: prefBool,
  [PREFERENCE_KEYS.PAYMENTS]: prefBool,
  [PREFERENCE_KEYS.MEMBERSHIP]: prefBool,
  [PREFERENCE_KEYS.SYSTEM_UPDATES]: prefBool,
  [PREFERENCE_KEYS.EMERGENCY_ALERTS]: prefBool,
  [PREFERENCE_KEYS.CHAT]: prefBool,
  quietHours: z
    .object({
      enabled: z.boolean().optional(),
      start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    })
    .optional(),
});

export const analyticsQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const trackSchema = z.object({
  status: z.enum(['delivered', 'opened', 'clicked', 'dismissed']),
});

export const listNotificationsQuery = paginationQuery.extend({
  unread: z.coerce.boolean().optional(),
});
