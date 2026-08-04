import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '../../config/constants';

export interface INotification {
  gym: Types.ObjectId | null;
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: Date | null;
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
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

export const Notification = model<INotification, NotificationModel>('Notification', notificationSchema);
export default Notification;
