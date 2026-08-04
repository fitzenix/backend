import { Types } from 'mongoose';
import { Notification, type NotificationDocument } from './notification.model';
import { ApiError } from '../../utils/ApiError';
import { parseListQuery } from '../../utils/pagination';
import { emitToUser } from '../../realtime/emitter';
import type { NotificationType } from '../../config/constants';
import type { Ctx, Paginated } from '../../types/index';

export interface NotifyInput {
  gym?: Types.ObjectId | string | null;
  user: Types.ObjectId | string;
  type?: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
  unread?: boolean;
}

export const notificationService = {
  /** Create a notification for one user and push it over the socket in real time. */
  async notify({ gym = null, user, type = 'system', title, body = '', data = {} }: NotifyInput): Promise<NotificationDocument> {
    const notification = await Notification.create({
      gym: gym ? new Types.ObjectId(String(gym)) : null,
      user: new Types.ObjectId(String(user)),
      type,
      title,
      body,
      data,
    });
    emitToUser(String(user), 'notification:new', notification.toJSON());
    return notification;
  },

  /** Notify many users at once. */
  async notifyMany(userIds: Array<Types.ObjectId | string>, payload: Omit<NotifyInput, 'user'>): Promise<NotificationDocument[]> {
    return Promise.all(userIds.map((user) => this.notify({ ...payload, user })));
  },

  async list(ctx: Ctx): Promise<Paginated<NotificationDocument> & { unread: number }> {
    const q = (ctx.validatedQuery ?? {}) as ListNotificationsQuery;
    const { page, limit, skip, sort } = parseListQuery(q);
    const filter: Record<string, unknown> = { user: ctx.user._id };
    if (q.unread === true) filter.readAt = null;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort(sort).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ user: ctx.user._id, readAt: null }),
    ]);
    return { items, page, limit, total, unread };
  },

  async markRead(ctx: Ctx, id: string): Promise<NotificationDocument> {
    const n = await Notification.findOne({ _id: id, user: ctx.user._id });
    if (!n) throw ApiError.notFound('Notification not found');
    if (!n.readAt) {
      n.readAt = new Date();
      await n.save();
    }
    return n;
  },

  async markAllRead(ctx: Ctx): Promise<{ updated: number }> {
    const res = await Notification.updateMany(
      { user: ctx.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    return { updated: res.modifiedCount };
  },
};

export default notificationService;
