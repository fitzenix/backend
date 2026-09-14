import { Router } from 'express';
import { paymentController } from './payment.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import { listQuery, checkoutSchema, verifySchema } from './payment.validators';

const router = Router();

// Public webhook (signature-verified inside the handler). No auth/tenant.
router.post('/webhook', paymentController.webhook);

router.use(authenticate, resolveTenant, requireTenant, requireActiveGym);

router.get('/', validate({ query: listQuery }), paymentController.list);
router.post('/checkout', validate({ body: checkoutSchema }), paymentController.checkout);
router.post('/verify', validate({ body: verifySchema }), paymentController.verify);
router.post('/:id/refund', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), validate({ params: idParam }), paymentController.refund);

router.get('/invoices', validate({ query: listQuery }), paymentController.listInvoices);
router.get('/invoices/:id', validate({ params: idParam }), paymentController.getInvoice);

export default router;
