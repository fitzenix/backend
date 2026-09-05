import { Router } from 'express';
import { z } from 'zod';
import { chatController } from './chat.controller';
import { authenticate } from '../../middleware/auth';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { requireActiveGym } from '../../middleware/gymAccess';
import { validate } from '../../middleware/validate';
import { objectId, idParam, paginationQuery } from '../../validators/common';

const router = Router();

const openSchema = z.object({ userId: objectId });
const messageSchema = z.object({ text: z.string().min(1).max(4000) });

router.use(authenticate, resolveTenant, requireTenant, requireActiveGym);

router.get('/conversations', validate({ query: paginationQuery }), chatController.listConversations);
router.post('/conversations', validate({ body: openSchema }), chatController.open);
router.get('/conversations/:id/messages', validate({ params: idParam, query: paginationQuery }), chatController.listMessages);
router.post('/conversations/:id/messages', validate({ params: idParam, body: messageSchema }), chatController.sendMessage);
router.post('/conversations/:id/read', validate({ params: idParam }), chatController.markRead);

export default router;
