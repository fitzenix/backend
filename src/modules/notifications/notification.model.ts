import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '../../config/constants';

export interface INotification {
  gym: Types.ObjectId | null;
  user: Types.ObjectId;
  type: NotificationType;
  event: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
  status: 'active' | 'deleted';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationModel = Model<INotification>;
export type NotificationDocument = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', index: true, default: null },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      default: NOTIFICATION_TYPES.SYSTEM,
    },
    event: { type: String, default: null, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'deleted'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ user: 1, deletedAt: 1, createdAt: -1 });
notificationSchema.index({ 'data.dedupeKey': 1, user: 1, createdAt: -1 });

export const Notification = model<INotification, NotificationModel>('Notification', notificationSchema);
export default Notification;
