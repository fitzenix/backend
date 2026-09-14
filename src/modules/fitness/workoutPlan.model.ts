import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes: string;
}

export interface WorkoutDay {
  day: string;
  focus: string;
  exercises: Exercise[];
}

export interface IWorkoutPlan {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  trainer: Types.ObjectId;
  title: string;
  description: string;
  days: WorkoutDay[];
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WorkoutPlanModel = Model<IWorkoutPlan>;
export type WorkoutPlanDocument = HydratedDocument<IWorkoutPlan>;

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

const workoutPlanSchema = new Schema<IWorkoutPlan, WorkoutPlanModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    days: { type: [daySchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const WorkoutPlan = model<IWorkoutPlan, WorkoutPlanModel>('WorkoutPlan', workoutPlanSchema);
export default WorkoutPlan;
