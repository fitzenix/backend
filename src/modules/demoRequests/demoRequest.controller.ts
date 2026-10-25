import type { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendCreated } from '../../utils/apiResponse';
import { demoRequestService } from './demoRequest.service';

export const demoRequestController = {
  create: asyncHandler<Request>(async (req, res) => {
    await demoRequestService.create(req.body);
    sendCreated(res, { data: { received: true }, message: 'Demo request received' });
  }),
};

export default demoRequestController;