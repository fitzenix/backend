import { Schema, model, Types, type HydratedDocument, type Model } from 'mongoose';
import type { Role } from '../../config/constants';

export type AccountDeletionStatus =
  | 'pending_verification'
  | 'processing'
  | 'awaiting_support_review'
  | 'completed'
  | 'failed';

export interface IAccountDeletionRequest {
  user: Types.ObjectId | null;
  gym: Types.ObjectId | null;
  role: Exclude<Role, 'super_admin'>;
  status: AccountDeletionStatus;
  isOpen: boolean;
  codeHash?: string;
  trackingTokenHash: string;
  attempts: number;
  reason?: string;
  expiresAt?: Date;
  verifiedAt?: Date;
  processingAt?: Date;
  completedAt?: Date;
  notificationEmail?: string;
  ownerResolution?: 'transferred' | 'closed';
  newOwner?: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  supportNotifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AccountDeletionRequestModel = Model<IAccountDeletionRequest>;
export type AccountDeletionRequestDocument = HydratedDocument<IAccountDeletionRequest>;

const accountDeletionRequestSchema = new Schema<IAccountDeletionRequest, AccountDeletionRequestModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', default: null, index: true },
    role: {
      type: String,
      enum: ['gym_owner', 'trainer', 'staff', 'member'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending_verification', 'processing', 'awaiting_support_review', 'completed', 'failed'],
      required: true,
      index: true,
    },
    isOpen: { type: Boolean, default: false },
    codeHash: { type: String, select: false },
    trackingTokenHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    reason: { type: String, maxlength: 1000 },
    expiresAt: { type: Date },
    verifiedAt: { type: Date },
    processingAt: { type: Date },
    completedAt: { type: Date },
    notificationEmail: { type: String, select: false },
    ownerResolution: { type: String, enum: ['transferred', 'closed'] },
    newOwner: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    supportNotifiedAt: { type: Date },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

accountDeletionRequestSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } },
);
accountDeletionRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountDeletionRequestSchema.index({ status: 1, createdAt: 1 });

export const AccountDeletionRequest = model<IAccountDeletionRequest>(
  'AccountDeletionRequest',
  accountDeletionRequestSchema,
);
export default AccountDeletionRequest;
