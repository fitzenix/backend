import { Router } from 'express';
import { z } from 'zod';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { paginationQuery, idParam } from '../../validators/common';

const router = Router();

const listQuery = paginationQuery.extend({
  unread: z.coerce.boolean().optional(),
});

router.use(authenticate);
router.get('/', validate({ query: listQuery }), notificationController.list);
router.post('/read-all', notificationController.markAllRead);
router.patch('/:id/read', validate({ params: idParam }), notificationController.markRead);

export default router;
