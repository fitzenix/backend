import { Router } from 'express';
import { billingController } from './billing.controller';
import { authenticate } from '../../middleware/auth';
import { resolveTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { billingCheckoutSchema, billingVerifySchema, billingUpiCollectSchema } from './billing.validators';

const router = Router();

/** Hosted Razorpay page + signature complete — no session required. */
router.get('/checkout-html', billingController.checkoutHtml);
router.post('/complete', billingController.complete);
router.get('/plans', billingController.plans);

router.use(authenticate, resolveTenant);

router.get('/status', billingController.status);
router.post('/checkout', validate({ body: billingCheckoutSchema }), billingController.checkout);
router.post('/upi/collect', validate({ body: billingUpiCollectSchema }), billingController.upiCollect);
router.post('/verify', validate({ body: billingVerifySchema }), billingController.verify);

export default router;
