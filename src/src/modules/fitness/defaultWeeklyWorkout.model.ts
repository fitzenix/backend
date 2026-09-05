import { Schema, model, type Model, type HydratedDocument } from 'mongoose';

export interface ScheduleExercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes: string;
}

export interface ScheduleDayTemplate {
  /** 0=Sun … 6=Sat (JS getDay). */
  weekday: number;
  title: string;
  focus: string;
  estimatedMinutes: number;
  exercises: ScheduleExercise[];
}

export interface ScheduleWeekTemplate {
  /** 0–3 → which week-of-month this rotation is for. */
  weekIndex: number;
  days: ScheduleDayTemplate[];
}

export interface IDefaultWeeklyWorkout {
  key: string;
  title: string;
  description: string;
  weeks: ScheduleWeekTemplate[];
  createdAt: Date;
  updatedAt: Date;
}

export type DefaultWeeklyWorkoutModel = Model<IDefaultWeeklyWorkout>;
export type DefaultWeeklyWorkoutDocument = HydratedDocument<IDefaultWeeklyWorkout>;

const exerciseSchema = new Schema<ScheduleExercise>(
  {
    name: { type: String, required: true },
    sets: { type: Number, default: 3, min: 0 },
    reps: { type: String, default: '10' },
    restSeconds: { type: Number, default: 60, min: 0 },
    notes: { type: String, default: '' },
  },
  { _id: false },
);

const daySchema = new Schema<ScheduleDayTemplate>(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    title: { type: String, required: true },
    focus: { type: String, default: '' },
    estimatedMinutes: { type: Number, default: 45, min: 0 },
    exercises: { type: [exerciseSchema], default: [] },
  },
  { _id: false },
);

const weekSchema = new Schema<ScheduleWeekTemplate>(
  {
    weekIndex: { type: Number, required: true, min: 0, max: 3 },
    days: { type: [daySchema], default: [] },
  },
  { _id: false },
);

const defaultWeeklyWorkoutSchema = new Schema<IDefaultWeeklyWorkout, DefaultWeeklyWorkoutModel>(
  {
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    weeks: { type: [weekSchema], default: [] },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const DefaultWeeklyWorkout = model<IDefaultWeeklyWorkout, DefaultWeeklyWorkoutModel>(
  'DefaultWeeklyWorkout',
  defaultWeeklyWorkoutSchema,
);

export default DefaultWeeklyWorkout;
