import { Router } from 'express';
import { z } from 'zod';
import { attendanceController } from './attendance.controller';
import { authenticate } from '../../middleware/auth';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { objectId, paginationQuery } from '../../validators/common';
import { ROLES } from '../../config/constants';

const router = Router();

const listQuery = paginationQuery.extend({
  memberId: objectId.optional(),
  status: z.enum(['checked_in', 'checked_out']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const checkSchema = z.object({
  memberId: objectId.optional(),
  source: z.enum(['self', 'staff', 'qr']).optional(),
});

const bulkSchema = z.object({
  memberIds: z.array(objectId).min(1).max(100),
  source: z.enum(['self', 'staff', 'qr']).optional(),
});

const STAFF = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER, ROLES.TRAINER] as const;
const OWNER = [ROLES.SUPER_ADMIN, ROLES.GYM_OWNER] as const;

router.use(authenticate, resolveTenant, requireTenant);

router.get('/', validate({ query: listQuery }), attendanceController.list);
router.get('/status', attendanceController.status);
router.post('/check-in', validate({ body: checkSchema }), attendanceController.checkIn);
router.post(
  '/bulk-check-in',
  authorize(...STAFF),
  validate({ body: bulkSchema }),
  attendanceController.bulkCheckIn,
);
router.post('/check-out', validate({ body: checkSchema }), attendanceController.checkOut);

router.get('/check-in-qr', authorize(...OWNER), attendanceController.checkInQr);
router.get('/check-in-sticker', authorize(...OWNER), attendanceController.checkInSticker);

export default router;
