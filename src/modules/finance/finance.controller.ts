import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { financeService } from './finance.service';
import type { AuthedRequest } from '../../types/index';
import type { DashboardQuery } from './finance.validators';

export const financeController = {
  dashboard: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await financeService.dashboard(req, (req.validatedQuery ?? {}) as DashboardQuery);
    sendSuccess(res, { data });
  }),

  // ── Expenses ─────────────────────────────────────────
  listExpenses: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await financeService.listExpenses(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  createExpense: asyncHandler<AuthedRequest>(async (req, res) => {
    const expense = await financeService.createExpense(req, req.body);
    sendCreated(res, { data: expense, message: 'Expense recorded' });
  }),

  updateExpense: asyncHandler<AuthedRequest>(async (req, res) => {
    const expense = await financeService.updateExpense(req, req.params.id, req.body);
    sendSuccess(res, { data: expense, message: 'Expense updated' });
  }),

  deleteExpense: asyncHandler<AuthedRequest>(async (req, res) => {
    await financeService.deleteExpense(req, req.params.id);
    sendSuccess(res, { message: 'Expense deleted' });
  }),

  // ── Invoices ─────────────────────────────────────────
  listInvoices: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await financeService.listInvoices(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  getInvoice: asyncHandler<AuthedRequest>(async (req, res) => {
    const invoice = await financeService.getInvoice(req, req.params.id);
    sendSuccess(res, { data: invoice });
  }),

  createInvoice: asyncHandler<AuthedRequest>(async (req, res) => {
    const invoice = await financeService.createInvoice(req, req.body);
    sendCreated(res, { data: invoice, message: 'Invoice created' });
  }),

  markInvoicePaid: asyncHandler<AuthedRequest>(async (req, res) => {
    const invoice = await financeService.markInvoicePaid(req, req.params.id, req.body);
    sendSuccess(res, { data: invoice, message: 'Invoice marked as paid' });
  }),

  markInvoiceUnpaid: asyncHandler<AuthedRequest>(async (req, res) => {
    const invoice = await financeService.markInvoiceUnpaid(req, req.params.id, req.body);
    sendSuccess(res, { data: invoice, message: 'Invoice marked as unpaid' });
  }),

  listPendingMembers: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await financeService.listPendingMembers(req);
    sendSuccess(res, { data });
  }),

  platformSummary: asyncHandler<AuthedRequest>(async (_req, res) => {
    const data = await financeService.platformSummary();
    sendSuccess(res, { data });
  }),

  platformTransactions: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await financeService.platformTransactions(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
};

export default financeController;
