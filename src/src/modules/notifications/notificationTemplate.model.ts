import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType, type PushEvent } from '../../config/constants';

export interface INotificationTemplate {
  key: string;
  event: PushEvent | string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink?: string;
  locale: string;
  variables: string[];
  status: 'active' | 'inactive';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationTemplateModel = Model<INotificationTemplate>;
export type NotificationTemplateDocument = HydratedDocument<INotificationTemplate>;

const templateSchema = new Schema<INotificationTemplate, NotificationTemplateModel>(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    event: { type: String, required: true, index: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), default: NOTIFICATION_TYPES.SYSTEM },
    title: { type: String, required: true },
    body: { type: String, required: true },
    deepLink: { type: String, default: '' },
    locale: { type: String, default: 'en' },
    variables: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const NotificationTemplate = model<INotificationTemplate, NotificationTemplateModel>(
  'NotificationTemplate',
  templateSchema,
);
export default NotificationTemplate;
