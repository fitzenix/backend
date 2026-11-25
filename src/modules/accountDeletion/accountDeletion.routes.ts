import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { ROLES } from '../../config/constants';
import { deletionLimiter, deletionVerifyLimiter } from '../../middleware/rateLimit';
import { idParam } from '../../validators/common';
import { accountDeletionController } from './accountDeletion.controller';
import {
  createDeletionRequestSchema,
  deletionStatusSchema,
  listDeletionRequestsSchema,
  resolveOwnerDeletionSchema,
  verifyDeletionRequestSchema,
} from './accountDeletion.validators';

const router = Router();

router.post(
  '/request',
  deletionLimiter,
  validate({ body: createDeletionRequestSchema }),
  accountDeletionController.request,
);
router.post(
  '/verify',
  deletionVerifyLimiter,
  validate({ body: verifyDeletionRequestSchema }),
  accountDeletionController.verify,
);
router.post('/status', deletionVerifyLimiter, validate({ body: deletionStatusSchema }), accountDeletionController.status);

router.get(
  '/support/requests',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate({ query: listDeletionRequestsSchema }),
  accountDeletionController.listForSupport,
);
router.post(
  '/support/requests/:id/resolve',
  authenticate,
  authorize(ROLES.SUPER_ADMIN),
  validate({ params: idParam, body: resolveOwnerDeletionSchema }),
  accountDeletionController.resolveOwnerRequest,
);

export default router;
