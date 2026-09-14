import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { trainerService } from './trainer.service';
import type { AuthedRequest } from '../../types/index';

export const trainerController = {
  listTrainers: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await trainerService.listTrainers(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  assign: asyncHandler<AuthedRequest>(async (req, res) => {
    const member = await trainerService.assign(req, req.body);
    sendSuccess(res, { data: member, message: 'Trainer assignment updated' });
  }),

  myMembers: asyncHandler<AuthedRequest>(async (req, res) => {
    const trainerId = req.params.trainerId ?? String(req.user._id);
    const { items, page, limit, total } = await trainerService.myMembers(req, trainerId);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  myTrainer: asyncHandler<AuthedRequest>(async (req, res) => {
    const trainer = await trainerService.myTrainer(req);
    sendSuccess(res, { data: trainer });
  }),
};

export default trainerController;
