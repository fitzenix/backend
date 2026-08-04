import { Router } from 'express';
import { z } from 'zod';
import { feedController } from './feed.controller';
import { authenticate } from '../../middleware/auth';
import { resolveTenant, requireTenant } from '../../middleware/tenant';
import { validate } from '../../middleware/validate';
import { uploadImages } from '../../middleware/upload';
import { objectId, paginationQuery } from '../../validators/common';

const router = Router();

const listQuery = paginationQuery.extend({ announcementsOnly: z.coerce.boolean().optional() });
const createSchema = z.object({
  content: z.string().max(5000).optional(),
  isAnnouncement: z.coerce.boolean().optional(),
});
const commentSchema = z.object({ text: z.string().min(1).max(1000) });
const idParam = z.object({ id: objectId });
const commentParams = z.object({ id: objectId, commentId: objectId });

router.use(authenticate, resolveTenant, requireTenant);

router.get('/', validate({ query: listQuery }), feedController.list);
router.get('/:id', validate({ params: idParam }), feedController.get);
router.post('/', uploadImages('images', 6), validate({ body: createSchema }), feedController.create);
router.delete('/:id', validate({ params: idParam }), feedController.remove);

router.post('/:id/like', validate({ params: idParam }), feedController.toggleLike);
router.post('/:id/comments', validate({ params: idParam, body: commentSchema }), feedController.addComment);
router.delete('/:id/comments/:commentId', validate({ params: commentParams }), feedController.removeComment);

export default router;
