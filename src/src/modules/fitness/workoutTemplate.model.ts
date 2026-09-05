import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import type { WorkoutDay, Exercise } from './workoutPlan.model';

export type WorkoutCadence = 'weekly' | 'daily' | 'custom';

export interface IWorkoutTemplate {
  gym: Types.ObjectId;
  trainer: Types.ObjectId;
  title: string;
  description: string;
  cadence: WorkoutCadence;
  days: WorkoutDay[];
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkoutTemplateModel = Model<IWorkoutTemplate>;
export type WorkoutTemplateDocument = HydratedDocument<IWorkoutTemplate>;

const exerciseSchema = new Schema<Exercise>(
  {
    name: { type: String, required: true },
    sets: { type: Number, default: 3, min: 0 },
    reps: { type: String, default: '10' },
    restSeconds: { type: Number, default: 60, min: 0 },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const daySchema = new Schema<WorkoutDay>(
  {
    day: { type: String, required: true },
    focus: { type: String, default: '' },
    exercises: { type: [exerciseSchema], default: [] },
  },
  { _id: false },
);

const workoutTemplateSchema = new Schema<IWorkoutTemplate, WorkoutTemplateModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    cadence: { type: String, enum: ['weekly', 'daily', 'custom'], default: 'weekly' },
    days: { type: [daySchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

workoutTemplateSchema.index({ gym: 1, trainer: 1, deletedAt: 1 });

export const WorkoutTemplate = model<IWorkoutTemplate, WorkoutTemplateModel>(
  'WorkoutTemplate',
  workoutTemplateSchema,
);
export default WorkoutTemplate;
