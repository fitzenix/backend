import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import type { StorageObject } from '../../types/index';

export interface IProgressLog {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  recordedBy: Types.ObjectId;
  date: Date;
  weightKg?: number;
  bodyFatPct?: number;
  measurements?: {
    chest?: number;
    waist?: number;
    hips?: number;
    arms?: number;
    thighs?: number;
  };
  notes: string;
  photo?: StorageObject;
  createdAt: Date;
  updatedAt: Date;
}

export type ProgressLogModel = Model<IProgressLog>;
export type ProgressLogDocument = HydratedDocument<IProgressLog>;

const progressLogSchema = new Schema<IProgressLog, ProgressLogModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true, default: Date.now },
    weightKg: { type: Number, min: 0 },
    bodyFatPct: { type: Number, min: 0, max: 100 },
    measurements: {
      chest: Number,
      waist: Number,
      hips: Number,
      arms: Number,
      thighs: Number,
    },
    notes: { type: String, default: '' },
    photo: { key: String, url: String },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

progressLogSchema.index({ member: 1, date: -1 });

export const ProgressLog = model<IProgressLog, ProgressLogModel>('ProgressLog', progressLogSchema);
export default ProgressLog;
