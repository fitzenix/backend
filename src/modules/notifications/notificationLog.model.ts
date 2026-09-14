import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'dismissed' | 'failed';

export interface INotificationLog {
  notification?: Types.ObjectId | null;
  user: Types.ObjectId;
  gym: Types.ObjectId | null;
  deviceToken?: Types.ObjectId | null;
  fcmToken?: string;
  event: string;
  channel: 'push' | 'socket' | 'in_app';
  status: DeliveryStatus;
  providerMessageId?: string;
  error?: string;
  retryCount: number;
  meta: Record<string, unknown>;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationLogModel = Model<INotificationLog>;
export type NotificationLogDocument = HydratedDocument<INotificationLog>;

const logSchema = new Schema<INotificationLog, NotificationLogModel>(
  {
    notification: { type: Schema.Types.ObjectId, ref: 'Notification', default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null, index: true },
    deviceToken: { type: Schema.Types.ObjectId, ref: 'DeviceToken', default: null },
    fcmToken: { type: String },
    event: { type: String, required: true, index: true },
    channel: { type: String, enum: ['push', 'socket', 'in_app'], default: 'push' },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'opened', 'clicked', 'dismissed', 'failed'],
      default: 'queued',
      index: true,
    },
    providerMessageId: { type: String },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

logSchema.index({ createdAt: -1 });
logSchema.index({ event: 1, status: 1, createdAt: -1 });

export const NotificationLog = model<INotificationLog, NotificationLogModel>('NotificationLog', logSchema);
export default NotificationLog;
