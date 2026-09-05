import { z } from 'zod';
import { objectId, paginationQuery } from '../../validators/common';

const expenseCategoryEnum = z.enum([
  'salaries',
  'rent',
  'utilities',
  'equipment',
  'marketing',
  'maintenance',
  'other',
]);

export const expenseListQuery = paginationQuery.extend({
  category: expenseCategoryEnum.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const createExpenseSchema = z.object({
  category: expenseCategoryEnum.default('other'),
  title: z.string().trim().min(2).max(120),
  amountPaise: z.coerce.number().int().min(1),
  note: z.string().trim().max(500).optional(),
  date: z.coerce.date().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1).max(160),
  quantity: z.coerce.number().int().min(1).default(1),
  unitPricePaise: z.coerce.number().int().min(0),
});

export const createInvoiceSchema = z.object({
  memberId: objectId,
  items: z.array(invoiceLineItemSchema).min(1).max(20),
  taxPaise: z.coerce.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
  dueDate: z.coerce.date().optional(),
  markPaid: z.boolean().optional(),
});

export const invoiceListQuery = paginationQuery.extend({
  memberId: objectId.optional(),
  status: z.enum(['unpaid', 'paid', 'void']).optional(),
});

export const invoiceNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const dashboardQuery = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuery>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;
export type InvoiceNoteInput = z.infer<typeof invoiceNoteSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuery>;
