import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import type { AuthedRequest } from '../../types/index';
import { accountDeletionService } from './accountDeletion.service';

export const accountDeletionController = {
  request: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.request(req.body);
    sendSuccess(res, {
      data: result,
      message: 'If the account details match, a verification code will be sent to the registered email.',
      status: 202,
    });
  }),

  verify: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.verify(req.body);
    sendSuccess(res, { data: result, message: 'Deletion request verified' });
  }),

  status: asyncHandler(async (req, res) => {
    const result = await accountDeletionService.status(req.body);
    sendSuccess(res, { data: result, message: 'Deletion request status' });
  }),

  listForSupport: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await accountDeletionService.listForSupport(req.validatedQuery as {
      page: number;
      limit: number;
    });
    sendSuccess(res, { data: result });
  }),

  resolveOwnerRequest: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await accountDeletionService.resolveOwnerRequest(req.params.id, req.body, req.user._id);
    sendSuccess(res, { data: result, message: 'Owner deletion request processed' });
  }),
};

export default accountDeletionController;
