import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { PAYMENT_STATUS, CURRENCY, type PaymentStatus } from '../../config/constants';

export interface IPayment {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  subscription: Types.ObjectId | null;
  provider: string;
  orderId?: string;
  paymentId?: string;
  refundId: string | null;
  /** Amount in INR paise (integer). */
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  purpose: string;
  notes: Record<string, unknown>;
  raw: Record<string, unknown>;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentModel = Model<IPayment>;
export type PaymentDocument = HydratedDocument<IPayment>;

const paymentSchema = new Schema<IPayment, PaymentModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subscription: { type: Schema.Types.ObjectId, ref: 'Subscription', default: null },
    provider: { type: String, default: 'razorpay' },
    orderId: { type: String, index: true },
    paymentId: { type: String, index: true },
    refundId: { type: String, default: null },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.CREATED,
      index: true,
    },
    purpose: { type: String, default: 'subscription' },
    notes: { type: Schema.Types.Mixed, default: {} },
    raw: { type: Schema.Types.Mixed, default: {} },
    paidAt: { type: Date },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const Payment = model<IPayment, PaymentModel>('Payment', paymentSchema);
export default Payment;
