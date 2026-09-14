import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface INotificationTopic {
  key: string;
  name: string;
  description?: string;
  kind: 'gym' | 'city' | 'state' | 'country' | 'role' | 'plan' | 'custom';
  gym?: Types.ObjectId | null;
  memberCount: number;
  status: 'active' | 'inactive';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationTopicModel = Model<INotificationTopic>;
export type NotificationTopicDocument = HydratedDocument<INotificationTopic>;

const topicSchema = new Schema<INotificationTopic, NotificationTopicModel>(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    kind: {
      type: String,
      enum: ['gym', 'city', 'state', 'country', 'role', 'plan', 'custom'],
      default: 'custom',
    },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null },
    memberCount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const NotificationTopic = model<INotificationTopic, NotificationTopicModel>(
  'NotificationTopic',
  topicSchema,
);
export default NotificationTopic;
