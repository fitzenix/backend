import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { enquiryService } from './enquiry.service';
import type { AuthedRequest } from '../../types/index';

export const enquiryController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await enquiryService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  get: asyncHandler<AuthedRequest>(async (req, res) => {
    const enquiry = await enquiryService.get(req, req.params.id);
    sendSuccess(res, { data: enquiry });
  }),

  create: asyncHandler<AuthedRequest>(async (req, res) => {
    const enquiry = await enquiryService.create(req, req.body);
    sendCreated(res, { data: enquiry, message: 'Enquiry created' });
  }),

  update: asyncHandler<AuthedRequest>(async (req, res) => {
    const enquiry = await enquiryService.update(req, req.params.id, req.body);
    sendSuccess(res, { data: enquiry, message: 'Enquiry updated' });
  }),

  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    await enquiryService.remove(req, req.params.id);
    sendSuccess(res, { message: 'Enquiry deleted' });
  }),
};

export default enquiryController;
