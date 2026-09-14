import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export const TENURE_END_REASON = {
  ACTIVE: 'active',
  TRANSFERRED: 'transferred',
  LEFT: 'left',
} as const;
export type TenureEndReason = (typeof TENURE_END_REASON)[keyof typeof TENURE_END_REASON];

export interface IGymTenure {
  member: Types.ObjectId;
  gym: Types.ObjectId;
  startedAt: Date;
  endedAt: Date | null;
  endReason: TenureEndReason;
  createdAt: Date;
  updatedAt: Date;
}

export type GymTenureModel = Model<IGymTenure>;
export type GymTenureDocument = HydratedDocument<IGymTenure>;

const schema = new Schema<IGymTenure, GymTenureModel>(
  {
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    startedAt: { type: Date, required: true, default: () => new Date() },
    endedAt: { type: Date, default: null },
    endReason: {
      type: String,
      enum: Object.values(TENURE_END_REASON),
      default: TENURE_END_REASON.ACTIVE,
    },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

schema.index({ member: 1, gym: 1, endedAt: 1 });

export const GymTenure = model<IGymTenure, GymTenureModel>('GymTenure', schema);
export default GymTenure;
