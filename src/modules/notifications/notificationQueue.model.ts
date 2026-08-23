import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '../../config/constants';

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface INotificationQueue {
  user?: Types.ObjectId | null;
  userIds: Types.ObjectId[];
  gym: Types.ObjectId | null;
  topic?: string;
  type: NotificationType;
  event: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  scheduledFor: Date;
  status: QueueStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  dedupeKey?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationQueueModel = Model<INotificationQueue>;
export type NotificationQueueDocument = HydratedDocument<INotificationQueue>;

const queueSchema = new Schema<INotificationQueue, NotificationQueueModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userIds: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null, index: true },
    topic: { type: String },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), default: NOTIFICATION_TYPES.SYSTEM },
    event: { type: String, required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    data: { type: Schema.Types.Mixed, default: {} },
    scheduledFor: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String },
    dedupeKey: { type: String, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

queueSchema.index({ status: 1, scheduledFor: 1 });
queueSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const NotificationQueue = model<INotificationQueue, NotificationQueueModel>(
  'NotificationQueue',
  queueSchema,
);
export default NotificationQueue;
