import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { ENQUIRY_STATUS, type EnquiryStatus } from '../../config/constants';

export interface IEnquiry {
  gym: Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  status: EnquiryStatus;
  source?: string;
  interestedPlan?: string;
  createdBy?: Types.ObjectId;
  convertedMember?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type EnquiryModel = Model<IEnquiry>;
export type EnquiryDocument = HydratedDocument<IEnquiry>;

const enquirySchema = new Schema<IEnquiry, EnquiryModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    note: { type: String, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: Object.values(ENQUIRY_STATUS),
      default: ENQUIRY_STATUS.NEW,
      index: true,
    },
    source: { type: String, trim: true },
    interestedPlan: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    convertedMember: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

enquirySchema.index({ gym: 1, status: 1, createdAt: -1 });

export const Enquiry = model<IEnquiry, EnquiryModel>('Enquiry', enquirySchema);
export default Enquiry;
