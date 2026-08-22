import { Router } from 'express';
import { z } from 'zod';
import { financeController } from './finance.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam, paginationQuery } from '../../validators/common';
import {
  expenseListQuery,
  createExpenseSchema,
  updateExpenseSchema,
  invoiceListQuery,
  createInvoiceSchema,
  invoiceNoteSchema,
  dashboardQuery,
} from './finance.validators';

const router = Router();

router.use(authenticate, resolveTenant, authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER));

// Platform (super_admin) — no gym tenant required
router.get(
  '/platform/summary',
  authorize(ROLES.SUPER_ADMIN),
  financeController.platformSummary,
);
router.get(
  '/platform/transactions',
  authorize(ROLES.SUPER_ADMIN),
  validate({
    query: paginationQuery.extend({
      status: z.enum(['created', 'paid', 'failed', 'refunded']).optional(),
    }),
  }),
  financeController.platformTransactions,
);

// Gym-scoped finance
router.use(requireTenant, requireActiveGym);

router.get('/dashboard', validate({ query: dashboardQuery }), financeController.dashboard);
router.get('/pending-members', financeController.listPendingMembers);

router.get('/expenses', validate({ query: expenseListQuery }), financeController.listExpenses);
router.post('/expenses', validate({ body: createExpenseSchema }), financeController.createExpense);
router.patch(
  '/expenses/:id',
  validate({ params: idParam, body: updateExpenseSchema }),
  financeController.updateExpense,
);
router.delete('/expenses/:id', validate({ params: idParam }), financeController.deleteExpense);

router.get('/invoices', validate({ query: invoiceListQuery }), financeController.listInvoices);
router.post('/invoices', validate({ body: createInvoiceSchema }), financeController.createInvoice);
router.get('/invoices/:id', validate({ params: idParam }), financeController.getInvoice);
router.patch(
  '/invoices/:id/mark-paid',
  validate({ params: idParam, body: invoiceNoteSchema }),
  financeController.markInvoicePaid,
);
router.patch(
  '/invoices/:id/mark-unpaid',
  validate({ params: idParam, body: invoiceNoteSchema }),
  financeController.markInvoiceUnpaid,
);

export default router;
