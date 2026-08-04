import { Router } from 'express';
import { z } from 'zod';
import { trainerController } from './trainer.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { objectId, paginationQuery } from '../../validators/common';

const router = Router();

const assignSchema = z.object({ memberId: objectId, trainerId: objectId.nullable().optional() });

router.use(authenticate, resolveTenant, requireTenant);

router.get('/', validate({ query: paginationQuery }), trainerController.listTrainers);
router.get('/me/trainer', authorize(ROLES.MEMBER), trainerController.myTrainer);
router.get('/me/members', authorize(ROLES.TRAINER), validate({ query: paginationQuery }), trainerController.myMembers);
router.get(
  '/:trainerId/members',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER),
  validate({ params: z.object({ trainerId: objectId }), query: paginationQuery }),
  trainerController.myMembers,
);
router.post('/assign', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), validate({ body: assignSchema }), trainerController.assign);

export default router;
