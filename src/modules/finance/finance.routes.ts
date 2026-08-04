import { Router } from 'express';
import { financeController } from './finance.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
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

router.use(authenticate, resolveTenant, requireTenant, authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER));

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
