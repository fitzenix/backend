import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { ApiError } from '../../utils/ApiError';
import { reportsService } from './reports.service';
import { ROLES } from '../../config/constants';
import type { AuthedRequest } from '../../types/index';

export const reportsController = {
  /** Role-aware dashboard: returns the right summary for the caller. */
  dashboard: asyncHandler<AuthedRequest>(async (req, res) => {
    const { role } = req.user;
    let data: unknown;
    if (role === ROLES.SUPER_ADMIN) {
      data = req.tenantId ? await reportsService.gym(req.tenantId) : await reportsService.platform();
    } else if (role === ROLES.GYM_OWNER) {
      if (!req.tenantId) throw ApiError.badRequest('gymId is required');
      data = await reportsService.gym(req.tenantId);
    } else if (role === ROLES.TRAINER) {
      data = await reportsService.trainer(req);
    } else {
      data = await reportsService.member(req);
    }
    sendSuccess(res, { data, message: `${role} dashboard` });
  }),

  platform: asyncHandler<AuthedRequest>(async (_req, res) => {
    const data = await reportsService.platform();
    sendSuccess(res, { data });
  }),

  gym: asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.tenantId) throw ApiError.badRequest('gymId is required');
    const data = await reportsService.gym(req.tenantId);
    sendSuccess(res, { data });
  }),

  revenue: asyncHandler<AuthedRequest>(async (req, res) => {
    const q = (req.validatedQuery ?? {}) as { months?: number };
    const data = await reportsService.revenueSeries({ gymId: req.tenantId, months: q.months ?? 6 });
    sendSuccess(res, { data });
  }),

  activity: asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.tenantId) throw ApiError.badRequest('gymId is required');
    const q = (req.validatedQuery ?? {}) as { limit?: number; page?: number };
    const { items, page, limit, total } = await reportsService.gymActivity(
      req.tenantId,
      q.limit ?? 20,
      q.page ?? 1,
    );
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  userGrowth: asyncHandler<AuthedRequest>(async (req, res) => {
    const q = (req.validatedQuery ?? {}) as { months?: number };
    const data = await reportsService.userGrowth({ months: q.months ?? 6 });
    sendSuccess(res, { data });
  }),
};

export default reportsController;
