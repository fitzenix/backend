import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { SUBSCRIPTION_STATUS, type SubscriptionStatus } from '../../config/constants';

export interface ISubscription {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  plan: Types.ObjectId;
  planSnapshot: { name?: string; durationDays?: number; pricePaise?: number; features?: string[] };
  startDate: Date;
  endDate: Date;
  status: SubscriptionStatus;
  payment: Types.ObjectId | null;
  autoRenew: boolean;
  cancelledAt: Date | null;
  lastExpiryReminderAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionModel = Model<ISubscription>;
export type SubscriptionDocument = HydratedDocument<ISubscription>;

const subscriptionSchema = new Schema<ISubscription, SubscriptionModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: 'MembershipPlan', required: true },
    planSnapshot: { name: String, durationDays: Number, pricePaise: Number, features: [String] },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.PENDING,
      index: true,
    },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    autoRenew: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    lastExpiryReminderAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true, versionKey: false } },
);

// Compound index accelerates the "current active subscription for a member" query.
subscriptionSchema.index({ gym: 1, member: 1, status: 1, endDate: -1 });

subscriptionSchema.virtual('isCurrentlyActive').get(function isActive(this: ISubscription) {
  return this.status === SUBSCRIPTION_STATUS.ACTIVE && this.endDate >= new Date();
});

export const Subscription = model<ISubscription, SubscriptionModel>('Subscription', subscriptionSchema);
export default Subscription;
