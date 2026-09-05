import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface IDeviceToken {
  user: Types.ObjectId;
  gym: Types.ObjectId | null;
  fcmToken: string;
  deviceId: string;
  platform: DevicePlatform;
  appVersion: string;
  osVersion: string;
  topics: string[];
  lastActiveAt: Date;
  status: 'active' | 'inactive' | 'invalid';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeviceTokenModel = Model<IDeviceToken>;
export type DeviceTokenDocument = HydratedDocument<IDeviceToken>;

const deviceTokenSchema = new Schema<IDeviceToken, DeviceTokenModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null, index: true },
    fcmToken: { type: String, required: true, trim: true },
    deviceId: { type: String, required: true, trim: true, index: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], required: true },
    appVersion: { type: String, default: '' },
    osVersion: { type: String, default: '' },
    topics: { type: [String], default: [] },
    lastActiveAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'invalid'], default: 'active', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

deviceTokenSchema.index({ fcmToken: 1 }, { unique: true });
deviceTokenSchema.index({ user: 1, deviceId: 1 }, { unique: true });
deviceTokenSchema.index({ user: 1, status: 1, deletedAt: 1 });

export const DeviceToken = model<IDeviceToken, DeviceTokenModel>('DeviceToken', deviceTokenSchema);
export default DeviceToken;
