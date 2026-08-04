import { Router } from 'express';
import { z } from 'zod';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';

const router = Router();

router.use(authenticate, resolveTenant);

router.get('/dashboard', reportsController.dashboard);
router.get('/platform', authorize(ROLES.SUPER_ADMIN), reportsController.platform);
router.get('/gym', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), reportsController.gym);
router.get(
  '/revenue',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER),
  validate({ query: z.object({ months: z.coerce.number().int().min(1).max(24).optional() }) }),
  reportsController.revenue,
);
router.get(
  '/activity',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER),
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }) }),
  reportsController.activity,
);

export default router;
