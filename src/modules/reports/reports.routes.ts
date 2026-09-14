import { Router } from 'express';
import { z } from 'zod';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';

const router = Router();

router.use(authenticate, resolveTenant, requireActiveGym);

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
  validate({ query: z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    page: z.coerce.number().int().min(1).optional(),
  }) }),
  reportsController.activity,
);
router.get(
  '/user-growth',
  authorize(ROLES.SUPER_ADMIN),
  validate({ query: z.object({ months: z.coerce.number().int().min(1).max(24).optional() }) }),
  reportsController.userGrowth,
);

export default router;
