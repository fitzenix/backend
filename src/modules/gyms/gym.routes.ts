import { Router } from 'express';
import { gymController } from './gym.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { uploadImage } from '../../middleware/upload';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import { listGymsQuery, updateGymSchema, brandingSchema, settingsSchema, statusSchema } from './gym.validators';

const router = Router();
const OWNER = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER] as const;

router.use(authenticate);

router.get('/me', gymController.getMine);
router.get('/', authorize(ROLES.SUPER_ADMIN), validate({ query: listGymsQuery }), gymController.list);
router.get('/:id', validate({ params: idParam }), gymController.getOne);

router.patch('/:id', authorize(...OWNER), validate({ params: idParam, body: updateGymSchema }), gymController.update);
router.patch(
  '/:id/branding',
  authorize(...OWNER),
  validate({ params: idParam, body: brandingSchema }),
  gymController.updateBranding,
);
router.patch(
  '/:id/settings',
  authorize(...OWNER),
  validate({ params: idParam, body: settingsSchema }),
  gymController.updateSettings,
);
router.post('/:id/logo', authorize(...OWNER), validate({ params: idParam }), uploadImage('logo'), gymController.uploadLogo);
router.post('/:id/cover', authorize(...OWNER), validate({ params: idParam }), uploadImage('cover'), gymController.uploadCover);

router.patch('/:id/status', authorize(ROLES.SUPER_ADMIN), validate({ params: idParam, body: statusSchema }), gymController.setStatus);
router.delete('/:id', authorize(ROLES.SUPER_ADMIN), validate({ params: idParam }), gymController.remove);

export default router;
