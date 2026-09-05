import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';

export interface MealItem {
  food: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  name: string;
  time: string;
  items: MealItem[];
}

export interface IDietPlan {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  trainer: Types.ObjectId;
  title: string;
  targetCalories: number;
  meals: Meal[];
  notes: string;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DietPlanModel = Model<IDietPlan>;
export type DietPlanDocument = HydratedDocument<IDietPlan>;

const mealItemSchema = new Schema<MealItem>(
  {
    food: { type: String, required: true },
    quantity: { type: String, default: '' },
    calories: { type: Number, default: 0, min: 0 },
    protein: { type: Number, default: 0, min: 0 },
    carbs: { type: Number, default: 0, min: 0 },
    fat: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const mealSchema = new Schema<Meal>(
  {
    name: { type: String, required: true },
    time: { type: String, default: '' },
    items: { type: [mealItemSchema], default: [] },
  },
  { _id: false },
);

const dietPlanSchema = new Schema<IDietPlan, DietPlanModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trainer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    targetCalories: { type: Number, default: 0, min: 0 },
    meals: { type: [mealSchema], default: [] },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const DietPlan = model<IDietPlan, DietPlanModel>('DietPlan', dietPlanSchema);
export default DietPlan;
