import { Router } from 'express';
import { membershipController } from './membership.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import { listQuery, createPlanSchema, updatePlanSchema, createSubscriptionSchema } from './membership.validators';

const router = Router();
const OWNER = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER] as const;

router.use(authenticate, resolveTenant, requireTenant);

// Plans
router.get('/plans', validate({ query: listQuery }), membershipController.listPlans);
router.get('/plans/:id', validate({ params: idParam }), membershipController.getPlan);
router.post('/plans', authorize(...OWNER), validate({ body: createPlanSchema }), membershipController.createPlan);
router.patch('/plans/:id', authorize(...OWNER), validate({ params: idParam, body: updatePlanSchema }), membershipController.updatePlan);
router.delete('/plans/:id', authorize(...OWNER), validate({ params: idParam }), membershipController.removePlan);

// Subscriptions
router.get('/subscriptions', validate({ query: listQuery }), membershipController.listSubscriptions);
router.get('/subscriptions/me/current', membershipController.myCurrent);
router.get('/my-plan', membershipController.myPlan);
router.post('/subscriptions', authorize(...OWNER), validate({ body: createSubscriptionSchema }), membershipController.createSubscription);
router.post('/subscriptions/:id/cancel', validate({ params: idParam }), membershipController.cancelSubscription);

export default router;
