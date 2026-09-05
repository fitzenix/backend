import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { feedService } from './feed.service';
import type { AuthedRequest } from '../../types/index';

export const feedController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await feedService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  get: asyncHandler<AuthedRequest>(async (req, res) => {
    const post = await feedService.get(req, req.params.id);
    sendSuccess(res, { data: post });
  }),
  create: asyncHandler<AuthedRequest>(async (req, res) => {
    const post = await feedService.create(req, req.body, (req.files as Express.Multer.File[]) ?? []);
    sendCreated(res, { data: post, message: 'Post created' });
  }),
  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await feedService.remove(req, req.params.id);
    sendSuccess(res, { data: result, message: 'Post removed' });
  }),
  toggleLike: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await feedService.toggleLike(req, req.params.id);
    sendSuccess(res, { data: result, message: result.liked ? 'Liked' : 'Unliked' });
  }),
  addComment: asyncHandler<AuthedRequest>(async (req, res) => {
    const comment = await feedService.addComment(req, req.params.id, req.body.text);
    sendCreated(res, { data: comment, message: 'Comment added' });
  }),
  removeComment: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await feedService.removeComment(req, req.params.id, req.params.commentId);
    sendSuccess(res, { data: result, message: 'Comment removed' });
  }),
};

export default feedController;
