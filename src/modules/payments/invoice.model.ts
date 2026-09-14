import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { CURRENCY, INVOICE_STATUS, type InvoiceStatus } from '../../config/constants';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
}

export interface IInvoice {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  payment?: Types.ObjectId;
  number: string;
  items: InvoiceLineItem[];
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  status: InvoiceStatus;
  note?: string;
  dueDate?: Date;
  createdBy?: Types.ObjectId;
  issuedAt: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceModel = Model<IInvoice>;
export type InvoiceDocument = HydratedDocument<IInvoice>;

const lineItemSchema = new Schema<InvoiceLineItem>(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new Schema<IInvoice, InvoiceModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
    number: { type: String, required: true, unique: true },
    items: { type: [lineItemSchema], default: [] },
    subtotalPaise: { type: Number, required: true, min: 0 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY },
    status: { type: String, enum: Object.values(INVOICE_STATUS), default: INVOICE_STATUS.UNPAID, index: true },
    note: { type: String, trim: true },
    dueDate: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

export const Invoice = model<IInvoice, InvoiceModel>('Invoice', invoiceSchema);
export default Invoice;
