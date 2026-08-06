import { Types } from 'mongoose';
import { Notification, type NotificationDocument } from './notification.model';
import { NotificationLog } from './notificationLog.model';
import { NotificationQueue } from './notificationQueue.model';
import { deviceTokenService } from './deviceToken.service';
import { preferenceService } from './preference.service';
import { fcmService } from '../../firebase/fcm.service';
import {
  createDedupeKey,
  deepLinkForEvent,
  preferenceKeyForType,
} from './notification.utils';
import { emitToUser } from '../../realtime/emitter';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';
import { parseListQuery } from '../../utils/pagination';
import type { NotificationType } from '../../config/constants';
import type { Ctx, Paginated } from '../../types/index';

export interface NotifyInput {
  gym?: Types.ObjectId | string | null;
  user: Types.ObjectId | string;
  type?: NotificationType;
  event?: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  /** Skip preference checks (emergency / mandatory). */
  force?: boolean;
  /** Skip FCM (socket + inbox only). */
  skipPush?: boolean;
  /** Prevent duplicate sends within a short window. */
  dedupeKey?: string;
  createdBy?: Types.ObjectId | string;
}

interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
  unread?: boolean;
}

export const notificationService = {
  /**
   * Create in-app notification, emit via Socket.IO, and fan-out FCM push
   * to all active devices for the user (respecting preferences).
   */
  async notify(input: NotifyInput): Promise<NotificationDocument> {
    const {
      gym = null,
      user,
      type = 'system',
      event,
      title,
      body = '',
      data = {},
      force = false,
      skipPush = false,
      dedupeKey,
      createdBy,
    } = input;

    const userId = String(user);
    const gymId = gym ? String(gym) : null;

    if (dedupeKey) {
      const recent = await Notification.findOne({
        user: userId,
        'data.dedupeKey': dedupeKey,
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
      }).lean();
      if (recent) return recent as unknown as NotificationDocument;
    }

    const allowed = await preferenceService.allows(userId, type, force);
    const deepLink =
      (typeof data.deepLink === 'string' && data.deepLink) ||
      (typeof data.screen === 'string' && data.screen) ||
      deepLinkForEvent(event);

    const payloadData = {
      ...data,
      type,
      event: event ?? type,
      deepLink,
      screen: deepLink,
      ...(dedupeKey ? { dedupeKey } : {}),
    };

    const notification = await Notification.create({
      gym: gymId ? new Types.ObjectId(gymId) : null,
      user: new Types.ObjectId(userId),
      type,
      event: event ?? null,
      title,
      body,
      data: payloadData,
      status: 'active',
      createdBy: createdBy ? new Types.ObjectId(String(createdBy)) : undefined,
    });

    emitToUser(userId, 'notification:new', notification.toJSON());

    await NotificationLog.create({
      notification: notification._id,
      user: userId,
      gym: gymId,
      event: event ?? type,
      channel: 'socket',
      status: 'sent',
      meta: { preference: preferenceKeyForType(type) },
    });

    if (allowed && !skipPush) {
      // Fire-and-forget push so API latency stays low
      void this.dispatchPush({
        notificationId: String(notification._id),
        userId,
        gymId,
        event: event ?? type,
        title,
        body,
        data: payloadData,
      }).catch((err) => logger.error({ err, userId }, 'Push dispatch failed'));
    } else {
      await NotificationLog.create({
        notification: notification._id,
        user: userId,
        gym: gymId,
        event: event ?? type,
        channel: 'push',
        status: 'dismissed',
        meta: { reason: allowed ? 'skip_push' : 'preference_disabled' },
      });
    }

    return notification;
  },

  async notifyMany(
    userIds: Array<Types.ObjectId | string>,
    payload: Omit<NotifyInput, 'user'>,
  ): Promise<NotificationDocument[]> {
    const unique = [...new Set(userIds.map(String))];
    const results: NotificationDocument[] = [];
    // Process in chunks to avoid overwhelming Mongo / FCM
    const CHUNK = 50;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const slice = unique.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      const batch = await Promise.all(slice.map((user) => this.notify({ ...payload, user })));
      results.push(...batch);
    }
    return results;
  },

  async dispatchPush(args: {
    notificationId: string;
    userId: string;
    gymId: string | null;
    event: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
  }): Promise<{ sent: number; failed: number }> {
    const devices = await deviceTokenService.listActiveTokensForUser(args.userId);
    if (!devices.length) return { sent: 0, failed: 0 };

    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.data)) {
      if (v === undefined || v === null) continue;
      stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    stringData.notificationId = args.notificationId;

    const results = await fcmService.sendToTokens(
      devices.map((d) => d.fcmToken),
      {
        title: args.title,
        body: args.body,
        data: stringData,
        androidChannelId: channelForEvent(args.event),
        collapseKey: args.event,
      },
    );

    let sent = 0;
    let failed = 0;
    const invalid: string[] = [];

    await Promise.all(
      results.map(async (r, idx) => {
        const device = devices[idx];
        if (r.success) {
          sent += 1;
          await NotificationLog.create({
            notification: args.notificationId,
            user: args.userId,
            gym: args.gymId,
            deviceToken: device?._id,
            fcmToken: r.token,
            event: args.event,
            channel: 'push',
            status: 'sent',
            providerMessageId: r.messageId,
            retryCount: r.retries,
          });
        } else {
          failed += 1;
          if (r.invalidToken) invalid.push(r.token);
          await NotificationLog.create({
            notification: args.notificationId,
            user: args.userId,
            gym: args.gymId,
            deviceToken: device?._id,
            fcmToken: r.token,
            event: args.event,
            channel: 'push',
            status: 'failed',
            error: r.errorMessage,
            retryCount: r.retries,
            meta: { code: r.errorCode },
          });
        }
      }),
    );

    if (invalid.length) await deviceTokenService.markInvalid(invalid);
    return { sent, failed };
  },

  async sendTopic(args: {
    topic: string;
    type?: NotificationType;
    event: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    gymId?: string | null;
    createdBy?: string;
  }) {
    const result = await fcmService.sendToTopic(args.topic, {
      title: args.title,
      body: args.body,
      data: {
        type: args.type ?? 'system',
        event: args.event,
        deepLink: deepLinkForEvent(args.event),
        ...(args.data as Record<string, string>),
      },
    });

    await NotificationLog.create({
      user: args.createdBy ?? new Types.ObjectId(),
      gym: args.gymId ?? null,
      event: args.event,
      channel: 'push',
      status: result.success ? 'sent' : 'failed',
      providerMessageId: result.messageId,
      error: result.errorMessage,
      meta: { topic: args.topic },
    });

    if (!result.success) throw ApiError.internal(result.errorMessage ?? 'Topic send failed');
    return result;
  },

  async schedule(args: {
    userIds?: string[];
    user?: string;
    gymId?: string | null;
    topic?: string;
    type?: NotificationType;
    event: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    scheduledFor: Date;
    dedupeKey?: string;
    createdBy?: string;
  }) {
    const dedupeKey =
      args.dedupeKey ??
      createDedupeKey([args.event, args.user, args.topic, args.scheduledFor.toISOString()]);

    try {
      const job = await NotificationQueue.create({
        user: args.user ?? null,
        userIds: args.userIds ?? (args.user ? [args.user] : []),
        gym: args.gymId ?? null,
        topic: args.topic,
        type: args.type ?? 'system',
        event: args.event,
        title: args.title,
        body: args.body,
        data: args.data ?? {},
        scheduledFor: args.scheduledFor,
        status: 'pending',
        dedupeKey,
        createdBy: args.createdBy,
      });
      return job;
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw ApiError.conflict('Duplicate scheduled notification');
      }
      throw err;
    }
  },

  async processQueue(limit = 100): Promise<{ processed: number; failed: number }> {
    const due = await NotificationQueue.find({
      status: 'pending',
      scheduledFor: { $lte: new Date() },
      deletedAt: null,
    })
      .sort({ scheduledFor: 1 })
      .limit(limit);

    let processed = 0;
    let failed = 0;

    for (const job of due) {
      job.status = 'processing';
      job.attempts += 1;
      // eslint-disable-next-line no-await-in-loop
      await job.save();

      try {
        if (job.topic) {
          // eslint-disable-next-line no-await-in-loop
          await this.sendTopic({
            topic: job.topic,
            type: job.type,
            event: job.event,
            title: job.title,
            body: job.body,
            data: job.data,
            gymId: job.gym ? String(job.gym) : null,
          });
        } else {
          const ids = (job.userIds?.length ? job.userIds : job.user ? [job.user] : []).map(String);
          // eslint-disable-next-line no-await-in-loop
          await this.notifyMany(ids, {
            gym: job.gym,
            type: job.type,
            event: job.event,
            title: job.title,
            body: job.body,
            data: job.data,
            dedupeKey: job.dedupeKey,
          });
        }
        job.status = 'completed';
        processed += 1;
      } catch (err) {
        job.lastError = err instanceof Error ? err.message : String(err);
        job.status = job.attempts >= job.maxAttempts ? 'failed' : 'pending';
        if (job.status === 'pending') {
          job.scheduledFor = new Date(Date.now() + 1000 * 2 ** job.attempts);
        }
        failed += 1;
        logger.error({ err, jobId: job._id }, 'Notification queue job failed');
      }
      // eslint-disable-next-line no-await-in-loop
      await job.save();
    }

    return { processed, failed };
  },

  async list(ctx: Ctx): Promise<Paginated<NotificationDocument> & { unread: number }> {
    const q = (ctx.validatedQuery ?? {}) as ListNotificationsQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: Record<string, unknown> = { user: ctx.user._id, deletedAt: null };
    if (q.unread === true) filter.readAt = null;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: ctx.user._id, readAt: null, deletedAt: null }),
    ]);
    return { items, page, limit, total, unread };
  },

  async unreadCount(ctx: Ctx): Promise<{ unread: number }> {
    const unread = await Notification.countDocuments({
      user: ctx.user._id,
      readAt: null,
      deletedAt: null,
    });
    return { unread };
  },

  async markRead(ctx: Ctx, id: string): Promise<NotificationDocument> {
    const n = await Notification.findOne({ _id: id, user: ctx.user._id, deletedAt: null });
    if (!n) throw ApiError.notFound('Notification not found');
    if (!n.readAt) {
      n.readAt = new Date();
      await n.save();
      await NotificationLog.create({
        notification: n._id,
        user: ctx.user._id,
        gym: n.gym,
        event: n.event ?? n.type,
        channel: 'in_app',
        status: 'opened',
      });
    }
    return n;
  },

  async markAllRead(ctx: Ctx): Promise<{ updated: number }> {
    const res = await Notification.updateMany(
      { user: ctx.user._id, readAt: null, deletedAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updated: res.modifiedCount };
  },

  async softDelete(ctx: Ctx, id: string): Promise<{ deleted: boolean }> {
    const n = await Notification.findOne({ _id: id, user: ctx.user._id, deletedAt: null });
    if (!n) throw ApiError.notFound('Notification not found');
    n.deletedAt = new Date();
    n.status = 'deleted';
    await n.save();
    return { deleted: true };
  },

  async trackAnalytics(
    ctx: Ctx,
    id: string,
    status: 'delivered' | 'opened' | 'clicked' | 'dismissed',
  ): Promise<{ ok: boolean }> {
    const n = await Notification.findOne({ _id: id, user: ctx.user._id });
    if (!n) throw ApiError.notFound('Notification not found');
    await NotificationLog.create({
      notification: n._id,
      user: ctx.user._id,
      gym: n.gym,
      event: n.event ?? n.type,
      channel: 'push',
      status,
      createdBy: ctx.user._id,
    });
    return { ok: true };
  },

  async analytics(ctx: Ctx, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const gymFilter =
      ctx.user.role === 'super_admin'
        ? {}
        : ctx.user.gym
          ? { gym: ctx.user.gym }
          : { user: ctx.user._id };

    const rows = await NotificationLog.aggregate([
      { $match: { ...gymFilter, createdAt: { $gte: since }, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r._id] = r.count;

    return {
      days,
      byStatus,
      delivered: byStatus.delivered ?? 0,
      opened: byStatus.opened ?? 0,
      clicked: byStatus.clicked ?? 0,
      failed: byStatus.failed ?? 0,
      dismissed: byStatus.dismissed ?? 0,
      sent: byStatus.sent ?? 0,
    };
  },
};

function channelForEvent(event: string): string {
  if (event.includes('workout') || event.includes('water') || event.includes('diet')) {
    return 'fitzenix_reminders';
  }
  if (event.includes('payment') || event.includes('membership')) return 'fitzenix_billing';
  if (event.includes('chat') || event.includes('message')) return 'fitzenix_chat';
  return 'fitzenix_default';
}

export default notificationService;
