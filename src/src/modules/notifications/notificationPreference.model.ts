import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { PREFERENCE_KEYS } from '../../config/constants';

export interface INotificationPreferences {
  user: Types.ObjectId;
  gym: Types.ObjectId | null;
  workoutReminder: boolean;
  dietReminder: boolean;
  marketing: boolean;
  offers: boolean;
  attendance: boolean;
  payments: boolean;
  membership: boolean;
  systemUpdates: boolean;
  emergencyAlerts: boolean;
  chat: boolean;
  quietHours?: { enabled: boolean; start: string; end: string };
  status: 'active' | 'inactive';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationPreferencesModel = Model<INotificationPreferences>;
export type NotificationPreferencesDocument = HydratedDocument<INotificationPreferences>;

const prefsSchema = new Schema<INotificationPreferences, NotificationPreferencesModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null },
    workoutReminder: { type: Boolean, default: true },
    dietReminder: { type: Boolean, default: true },
    marketing: { type: Boolean, default: false },
    offers: { type: Boolean, default: true },
    attendance: { type: Boolean, default: true },
    payments: { type: Boolean, default: true },
    membership: { type: Boolean, default: true },
    systemUpdates: { type: Boolean, default: true },
    emergencyAlerts: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const DEFAULT_PREFERENCES: Record<(typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS], boolean> = {
  workoutReminder: true,
  dietReminder: true,
  marketing: false,
  offers: true,
  attendance: true,
  payments: true,
  membership: true,
  systemUpdates: true,
  emergencyAlerts: true,
  chat: true,
};

export const NotificationPreferences = model<INotificationPreferences, NotificationPreferencesModel>(
  'NotificationPreferences',
  prefsSchema,
);
export default NotificationPreferences;
