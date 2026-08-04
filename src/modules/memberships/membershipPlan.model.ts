import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface IMembershipPlan {
  gym: Types.ObjectId;
  name: string;
  description: string;
  durationDays: number;
  /** Price stored in INR paise (integer). */
  pricePaise: number;
  features: string[];
  trainerIncluded: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipPlanModel = Model<IMembershipPlan>;
export type MembershipPlanDocument = HydratedDocument<IMembershipPlan>;

const membershipPlanSchema = new Schema<IMembershipPlan, MembershipPlanModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '' },
    durationDays: { type: Number, required: true, min: 1 },
    pricePaise: { type: Number, required: true, min: 0 },
    features: { type: [String], default: [] },
    trainerIncluded: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

membershipPlanSchema.index({ gym: 1, name: 1 });

export const MembershipPlan = model<IMembershipPlan, MembershipPlanModel>(
  'MembershipPlan',
  membershipPlanSchema,
);
export default MembershipPlan;
