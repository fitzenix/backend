import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export const TRANSFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[keyof typeof TRANSFER_STATUS];

export interface IGymTransfer {
  member: Types.ObjectId;
  fromGym: Types.ObjectId;
  toGym: Types.ObjectId;
  requestedBy: Types.ObjectId;
  status: TransferStatus;
  otpHash?: string;
  otpExpires?: Date;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type GymTransferModel = Model<IGymTransfer>;
export type GymTransferDocument = HydratedDocument<IGymTransfer>;

const schema = new Schema<IGymTransfer, GymTransferModel>(
  {
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromGym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    toGym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(TRANSFER_STATUS),
      default: TRANSFER_STATUS.PENDING,
      index: true,
    },
    otpHash: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    acknowledgedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

schema.index({ member: 1, status: 1 });

export const GymTransfer = model<IGymTransfer, GymTransferModel>('GymTransfer', schema);
export default GymTransfer;
