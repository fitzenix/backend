import { Router } from 'express';
import { z } from 'zod';
import { trainerController } from './trainer.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { objectId, paginationQuery } from '../../validators/common';

const router = Router();

const assignSchema = z.object({ memberId: objectId, trainerId: objectId.nullable().optional() });
const trainerListQuery = paginationQuery.extend({
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
});

router.use(authenticate, resolveTenant, requireTenant, requireActiveGym);

router.get('/', validate({ query: trainerListQuery }), trainerController.listTrainers);
router.get('/me/trainer', authorize(ROLES.MEMBER), trainerController.myTrainer);
router.get('/me/members', authorize(ROLES.TRAINER), validate({ query: trainerListQuery }), trainerController.myMembers);
router.get(
  '/:trainerId/members',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER),
  validate({ params: z.object({ trainerId: objectId }), query: trainerListQuery }),
  trainerController.myMembers,
);
router.post('/assign', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), validate({ body: assignSchema }), trainerController.assign);

export default router;
