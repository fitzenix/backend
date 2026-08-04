import { Router } from 'express';
import { enquiryController } from './enquiry.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { idParam } from '../../validators/common';
import { enquiryListQuery, createEnquirySchema, updateEnquirySchema } from './enquiry.validators';

const router = Router();
const OWNER = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER] as const;

router.use(authenticate, resolveTenant, requireTenant, authorize(...OWNER));

router.get('/', validate({ query: enquiryListQuery }), enquiryController.list);
router.post('/', validate({ body: createEnquirySchema }), enquiryController.create);
router.get('/:id', validate({ params: idParam }), enquiryController.get);
router.patch(
  '/:id',
  validate({ params: idParam, body: updateEnquirySchema }),
  enquiryController.update,
);
router.delete('/:id', validate({ params: idParam }), enquiryController.remove);

export default router;
