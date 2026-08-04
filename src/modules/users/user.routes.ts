import { Router } from 'express';
import { userController } from './user.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { uploadImage } from '../../middleware/upload';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import { listUsersQuery, createUserSchema, updateUserSchema, updateProfileSchema } from './user.validators';

const router = Router();

router.use(authenticate);

// Self-service (any authenticated user)
router.patch('/me', validate({ body: updateProfileSchema }), userController.updateMe);
router.post('/me/avatar', uploadImage('avatar'), userController.uploadAvatar);

// Management (gym_owner within their gym, super_admin anywhere)
router.use(resolveTenant);

router.get(
  '/',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER, ROLES.TRAINER),
  validate({ query: listUsersQuery }),
  userController.list,
);
router.post('/', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), validate({ body: createUserSchema }), userController.create);
router.get(
  '/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER, ROLES.TRAINER),
  validate({ params: idParam }),
  userController.getOne,
);
router.patch(
  '/:id',
  authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER),
  validate({ params: idParam, body: updateUserSchema }),
  userController.update,
);
router.delete('/:id', authorize(ROLES.SUPER_ADMIN, ROLES.GYM_OWNER), validate({ params: idParam }), userController.remove);

export default router;
