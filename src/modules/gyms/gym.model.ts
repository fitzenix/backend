import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { GYM_STATUS, type GymStatus } from '../../config/constants';
import type { StorageObject } from '../../types/index';

export interface GymBranding {
  primaryColor: string;
  secondaryColor: string;
  logo?: StorageObject;
  cover?: StorageObject;
  tagline: string;
}

export interface GymSettings {
  timezone: string;
  currency: string;
  allowMemberSelfCheckin: boolean;
  membershipExpiryReminderDays: number;
  workingHours: { open: string; close: string };
}

export interface IGym {
  name: string;
  slug: string;
  owner: Types.ObjectId;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
  geo?: { lat?: number; lng?: number };
  branding: GymBranding;
  settings: GymSettings;
  status: GymStatus;
  trialEndsAt?: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GymModel = Model<IGym>;
export type GymDocument = HydratedDocument<IGym>;

const brandingSchema = new Schema<GymBranding>(
  {
    primaryColor: { type: String, default: '#6C5CE7' },
    secondaryColor: { type: String, default: '#00B894' },
    logo: { key: String, url: String },
    cover: { key: String, url: String },
    tagline: { type: String, default: '' },
  },
  { _id: false },
);

const settingsSchema = new Schema<GymSettings>(
  {
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    allowMemberSelfCheckin: { type: Boolean, default: true },
    membershipExpiryReminderDays: { type: Number, default: 7, min: 0 },
    workingHours: {
      open: { type: String, default: '06:00' },
      close: { type: String, default: '22:00' },
    },
  },
  { _id: false },
);

const gymSchema = new Schema<IGym, GymModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' },
    },
    geo: { lat: Number, lng: Number },
    branding: { type: brandingSchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) },
    status: { type: String, enum: Object.values(GYM_STATUS), default: GYM_STATUS.TRIAL, index: true },
    trialEndsAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const Gym = model<IGym, GymModel>('Gym', gymSchema);
export default Gym;
