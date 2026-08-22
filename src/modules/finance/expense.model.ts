import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { CURRENCY, EXPENSE_CATEGORIES, type ExpenseCategory } from '../../config/constants';

export interface IExpense {
  gym: Types.ObjectId;
  category: ExpenseCategory;
  title: string;
  amountPaise: number;
  note?: string;
  date: Date;
  currency: string;
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpenseModel = Model<IExpense>;
export type ExpenseDocument = HydratedDocument<IExpense>;

const expenseSchema = new Schema<IExpense, ExpenseModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    category: {
      type: String,
      enum: Object.values(EXPENSE_CATEGORIES),
      default: EXPENSE_CATEGORIES.OTHER,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    amountPaise: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true },
    date: { type: Date, default: Date.now, index: true },
    currency: { type: String, default: CURRENCY },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

expenseSchema.index({ gym: 1, note: 1 });

export const Expense = model<IExpense, ExpenseModel>('Expense', expenseSchema);
export default Expense;
