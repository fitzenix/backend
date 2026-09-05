import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { notificationService } from './notification.service';
import { deviceTokenService } from './deviceToken.service';
import { preferenceService } from './preference.service';
import { ROLES } from '../../config/constants';
import { ApiError } from '../../utils/ApiError';
import type { AuthedRequest } from '../../types/index';
import type { NotificationType } from '../../config/constants';

function assertCanBroadcast(req: AuthedRequest): void {
  if (req.user.role !== ROLES.SUPER_ADMIN && req.user.role !== ROLES.GYM_OWNER) {
    throw ApiError.forbidden('Only owners and admins can send notifications');
  }
}

function assertGymScope(req: AuthedRequest, gymId?: string | null): string | null {
  if (req.user.role === ROLES.SUPER_ADMIN) return gymId ?? null;
  const own = req.user.gym ? String(req.user.gym) : null;
  if (gymId && own && gymId !== own) throw ApiError.forbidden('Gym ownership mismatch');
  return own;
}

export const notificationController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total, unread } = await notificationService.list(req);
    sendSuccess(res, { data: items, meta: { ...paginationMeta({ page, limit, total }), unread } });
  }),

  unreadCount: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await notificationService.unreadCount(req);
    sendSuccess(res, { data });
  }),

  markRead: asyncHandler<AuthedRequest>(async (req, res) => {
    const n = await notificationService.markRead(req, req.params.id);
    sendSuccess(res, { data: n, message: 'Marked as read' });
  }),

  markAllRead: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await notificationService.markAllRead(req);
    sendSuccess(res, { data: result, message: 'All notifications marked read' });
  }),

  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await notificationService.softDelete(req, req.params.id);
    sendSuccess(res, { data: result, message: 'Notification deleted' });
  }),

  track: asyncHandler<AuthedRequest>(async (req, res) => {
    const { status } = req.body as { status: 'delivered' | 'opened' | 'clicked' | 'dismissed' };
    const result = await notificationService.trackAnalytics(req, req.params.id, status);
    sendSuccess(res, { data: result });
  }),

  registerDevice: asyncHandler<AuthedRequest>(async (req, res) => {
    const body = req.body as {
      fcmToken: string;
      deviceId: string;
      platform: 'android' | 'ios' | 'web';
      appVersion?: string;
      osVersion?: string;
    };
    const doc = await deviceTokenService.register({
      userId: String(req.user._id),
      gymId: req.user.gym ? String(req.user.gym) : null,
      role: req.user.role,
      ...body,
    });
    sendSuccess(res, { data: doc, message: 'Device registered', status: 201 });
  }),

  deleteDevice: asyncHandler<AuthedRequest>(async (req, res) => {
    const body = req.body as { deviceId?: string; fcmToken?: string };
    const result = await deviceTokenService.deactivate(String(req.user._id), body.deviceId, body.fcmToken);
    sendSuccess(res, { data: result, message: 'Device unregistered' });
  }),

  getPreferences: asyncHandler<AuthedRequest>(async (req, res) => {
    const prefs = await preferenceService.getForCtx(req);
    sendSuccess(res, { data: preferenceService.toPublic(prefs) });
  }),

  updatePreferences: asyncHandler<AuthedRequest>(async (req, res) => {
    const prefs = await preferenceService.update(req, req.body);
    sendSuccess(res, { data: preferenceService.toPublic(prefs), message: 'Preferences updated' });
  }),

  send: asyncHandler<AuthedRequest>(async (req, res) => {
    assertCanBroadcast(req);
    const body = req.body as {
      userId: string;
      gymId?: string | null;
      type?: NotificationType;
      event?: string;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
      force?: boolean;
      dedupeKey?: string;
    };
    const gymId = assertGymScope(req, body.gymId);
    const n = await notificationService.notify({
      user: body.userId,
      gym: gymId,
      type: body.type,
      event: body.event,
      title: body.title,
      body: body.body,
      data: body.data,
      force: body.force,
      dedupeKey: body.dedupeKey,
      createdBy: String(req.user._id),
    });
    sendSuccess(res, { data: n, message: 'Notification sent', status: 201 });
  }),

  sendBulk: asyncHandler<AuthedRequest>(async (req, res) => {
    assertCanBroadcast(req);
    const body = req.body as {
      userIds: string[];
      gymId?: string | null;
      type?: NotificationType;
      event?: string;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
      force?: boolean;
      dedupeKey?: string;
    };
    const gymId = assertGymScope(req, body.gymId);
    const items = await notificationService.notifyMany(body.userIds, {
      gym: gymId,
      type: body.type,
      event: body.event,
      title: body.title,
      body: body.body,
      data: body.data,
      force: body.force,
      dedupeKey: body.dedupeKey,
      createdBy: String(req.user._id),
    });
    sendSuccess(res, {
      data: { count: items.length },
      message: `Queued ${items.length} notifications`,
      status: 201,
    });
  }),

  sendTopic: asyncHandler<AuthedRequest>(async (req, res) => {
    assertCanBroadcast(req);
    const body = req.body as {
      topic: string;
      type?: NotificationType;
      event: string;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
      gymId?: string | null;
    };
    const gymId = assertGymScope(req, body.gymId);
    // Gym owners may only publish to their gym topic
    if (req.user.role === ROLES.GYM_OWNER && gymId && body.topic !== `gym_${gymId}`) {
      throw ApiError.forbidden('Owners may only send to their gym topic');
    }
    const result = await notificationService.sendTopic({
      topic: body.topic,
      type: body.type,
      event: body.event,
      title: body.title,
      body: body.body ?? '',
      data: body.data,
      gymId,
      createdBy: String(req.user._id),
    });
    sendSuccess(res, { data: result, message: 'Topic notification sent' });
  }),

  schedule: asyncHandler<AuthedRequest>(async (req, res) => {
    assertCanBroadcast(req);
    const body = req.body as {
      userId?: string;
      userIds?: string[];
      topic?: string;
      gymId?: string | null;
      type?: NotificationType;
      event: string;
      title: string;
      body?: string;
      data?: Record<string, unknown>;
      scheduledFor: Date;
      dedupeKey?: string;
    };
    const gymId = assertGymScope(req, body.gymId);
    const job = await notificationService.schedule({
      user: body.userId,
      userIds: body.userIds,
      topic: body.topic,
      gymId,
      type: body.type,
      event: body.event,
      title: body.title,
      body: body.body ?? '',
      data: body.data,
      scheduledFor: new Date(body.scheduledFor),
      dedupeKey: body.dedupeKey,
      createdBy: String(req.user._id),
    });
    sendSuccess(res, { data: job, message: 'Notification scheduled', status: 201 });
  }),

  analytics: asyncHandler<AuthedRequest>(async (req, res) => {
    assertCanBroadcast(req);
    const days = Number((req.validatedQuery as { days?: number })?.days ?? 30);
    const data = await notificationService.analytics(req, days);
    sendSuccess(res, { data });
  }),
};

export default notificationController;
