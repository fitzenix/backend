import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { ROLE_VALUES, USER_STATUS, type Role, type UserStatus } from '../../config/constants';
import type { StorageObject } from '../../types/index';

export interface TrainerProfile {
  specialties: string[];
  bio: string;
  experienceYears: number;
  certifications: string[];
  hourlyRatePaise: number;
  rating: number;
}

export interface StaffProfile {
  jobTitle: string;
  department?: string;
}

export interface MemberProfile {
  dateOfBirth?: Date;
  gender: 'male' | 'female' | 'other' | 'unspecified';
  heightCm?: number;
  weightKg?: number;
  goals: string[];
  measurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    arms?: number;
    thighs?: number;
  };
  preferences?: {
    pushNotifications?: boolean;
    emailUpdates?: boolean;
  };
  emergencyContact?: { name?: string; phone?: string };
  assignedTrainer?: Types.ObjectId | null;
  /** When true, this member may check in/out twice a day (AM + PM sessions). Default: AM-only. */
  allowTwoSessions?: boolean;
}

export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: Role;
  gym: Types.ObjectId | null;
  status: UserStatus;
  avatar?: StorageObject;
  emailVerified: boolean;
  lastLoginAt?: Date;
  trainerProfile?: TrainerProfile;
  staffProfile?: StaffProfile;
  memberProfile?: MemberProfile;
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  otpHash?: string;
  otpExpires?: Date;
  otpPurpose?: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(plain: string): Promise<boolean>;
  setPassword(plain: string): Promise<void>;
}

export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export type UserDocument = HydratedDocument<IUser, IUserMethods>;

const trainerProfileSchema = new Schema<TrainerProfile>(
  {
    specialties: { type: [String], default: [] },
    bio: { type: String, default: '' },
    experienceYears: { type: Number, default: 0, min: 0 },
    certifications: { type: [String], default: [] },
    hourlyRatePaise: { type: Number, default: 0, min: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
  },
  { _id: false },
);

const memberProfileSchema = new Schema<MemberProfile>(
  {
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'unspecified'], default: 'unspecified' },
    heightCm: { type: Number, min: 0 },
    weightKg: { type: Number, min: 0 },
    goals: { type: [String], default: [] },
    measurements: {
      chest: Number,
      waist: Number,
      hips: Number,
      arms: Number,
      thighs: Number,
    },
    preferences: {
      pushNotifications: { type: Boolean, default: true },
      emailUpdates: { type: Boolean, default: true },
    },
    emergencyContact: { name: String, phone: String },
    assignedTrainer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    allowTwoSessions: { type: Boolean, default: false },
  },
  { _id: false },
);

const staffProfileSchema = new Schema<StaffProfile>(
  {
    jobTitle: { type: String, trim: true, default: 'Staff' },
    department: { type: String, trim: true },
  },
  { _id: false },
);

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_VALUES, required: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null, index: true },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },
    avatar: { key: String, url: String },
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    trainerProfile: { type: trainerProfileSchema, default: undefined },
    staffProfile: { type: staffProfileSchema, default: undefined },
    memberProfile: { type: memberProfileSchema, default: undefined },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpPurpose: { type: String, select: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).passwordHash;
        delete (ret as Record<string, unknown>).resetTokenHash;
        delete (ret as Record<string, unknown>).resetTokenExpires;
        delete (ret as Record<string, unknown>).otpHash;
        delete (ret as Record<string, unknown>).otpExpires;
        delete (ret as Record<string, unknown>).otpPurpose;
        return ret;
      },
    },
  },
);

// Email is globally unique so login-by-email is unambiguous across tenants.
userSchema.index({ email: 1 }, { unique: true });

userSchema.methods.comparePassword = function comparePassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.setPassword = async function setPassword(plain: string): Promise<void> {
  this.passwordHash = await bcrypt.hash(plain, env.bcryptRounds);
};

export const User = model<IUser, UserModel>('User', userSchema);
export default User;
