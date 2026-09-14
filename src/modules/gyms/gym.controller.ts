import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { gymService } from './gym.service';
import type { AuthedRequest } from '../../types/index';

export const gymController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await gymService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  getMine: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.getMine(req);
    const { billingService } = await import('../billing/billing.service');
    const { computeGymAccess } = await import('../billing/billing.access');
    await billingService.ensureFresh(gym);
    sendSuccess(res, { data: { ...gym.toJSON(), access: computeGymAccess(gym) } });
  }),

  getOne: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.getById(req.params.id);
    sendSuccess(res, { data: gym });
  }),

  create: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.create(req, req.body);
    sendSuccess(res, { data: gym, message: 'Gym created', status: 201 });
  }),

  update: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.update(req, req.params.id, req.body);
    sendSuccess(res, { data: gym, message: 'Gym updated' });
  }),

  updateBranding: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.updateBranding(req, req.params.id, req.body);
    sendSuccess(res, { data: gym, message: 'Branding updated' });
  }),

  updateSettings: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.updateSettings(req, req.params.id, req.body);
    sendSuccess(res, { data: gym, message: 'Settings updated' });
  }),

  uploadLogo: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.uploadBrandingImage(req, req.params.id, 'logo', req.file);
    sendSuccess(res, { data: gym, message: 'Logo updated' });
  }),

  uploadCover: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.uploadBrandingImage(req, req.params.id, 'cover', req.file);
    sendSuccess(res, { data: gym, message: 'Cover updated' });
  }),

  setStatus: asyncHandler<AuthedRequest>(async (req, res) => {
    const gym = await gymService.setStatus(req.params.id, req.body.status);
    sendSuccess(res, { data: gym, message: 'Gym status updated' });
  }),

  remove: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await gymService.remove(req.params.id);
    sendSuccess(res, { data: result, message: 'Gym removed' });
  }),
};

export default gymController;
