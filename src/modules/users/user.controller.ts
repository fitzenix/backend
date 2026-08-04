import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { userService } from './user.service';
import type { AuthedRequest } from '../../types/index';

export const userController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await userService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  getOne: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await userService.getById(req, req.params.id);
    sendSuccess(res, { data: user });
  }),

  create: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await userService.create(req, req.body);
    sendCreated(res, { data: user, message: 'User created' });
  }),

  update: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await userService.update(req, req.params.id, req.body);
    sendSuccess(res, { data: user, message: 'User updated' });
  }),

  updateMe: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await userService.updateProfile(req.user, req.body);
    sendSuccess(res, { data: user, message: 'Profile updated' });
  }),

  uploadAvatar: asyncHandler<AuthedRequest>(async (req, res) => {
    const user = await userService.setAvatar(req.user, req.file);
    sendSuccess(res, { data: user, message: 'Avatar updated' });
  }),

  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await userService.remove(req, req.params.id);
    sendSuccess(res, { data: result, message: 'User removed' });
  }),
};

export default userController;
