import { Schema, model, type HydratedDocument, type Model } from 'mongoose';

export interface IDemoRequest {
  name: string;
  phone: string;
  email: string;
  city: string;
  gymName: string;
  status: 'new' | 'contacted' | 'completed';
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DemoRequestModel = Model<IDemoRequest>;
export type DemoRequestDocument = HydratedDocument<IDemoRequest>;

const demoRequestSchema = new Schema<IDemoRequest, DemoRequestModel>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    gymName: { type: String, required: true, trim: true, maxlength: 160 },
    status: { type: String, enum: ['new', 'contacted', 'completed'], default: 'new', index: true },
    source: { type: String, default: 'website', trim: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

demoRequestSchema.index({ createdAt: -1 });

export const DemoRequest = model<IDemoRequest, DemoRequestModel>('DemoRequest', demoRequestSchema);
export default DemoRequest;