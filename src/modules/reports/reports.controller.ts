import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { ApiError } from '../../utils/ApiError';
import { reportsService } from './reports.service';
import { ROLES } from '../../config/constants';
import { cachedRead } from '../../utils/hotCache';
import type { AuthedRequest } from '../../types/index';

const READ_TTL = 15_000;

export const reportsController = {
  /** Role-aware dashboard: returns the right summary for the caller. */
  dashboard: asyncHandler<AuthedRequest>(async (req, res) => {
    const { role } = req.user;
    let data: unknown;
    if (role === ROLES.SUPER_ADMIN) {
      data = req.tenantId
        ? await cachedRead(`g:${req.tenantId}:dash:owner`, READ_TTL, () => reportsService.gym(req.tenantId as string))
        : await cachedRead('g:platform:dash', READ_TTL, () => reportsService.platform());
    } else if (role === ROLES.GYM_OWNER) {
      if (!req.tenantId) throw ApiError.badRequest('gymId is required');
      data = await cachedRead(`g:${req.tenantId}:dash:owner`, READ_TTL, () => reportsService.gym(req.tenantId as string));
    } else if (role === ROLES.TRAINER) {
      data = await cachedRead(`g:${req.tenantId}:dash:trainer:${req.user._id}`, READ_TTL, () => reportsService.trainer(req));
    } else {
      data = await cachedRead(`g:${req.tenantId}:dash:member:${req.user._id}`, READ_TTL, () => reportsService.member(req));
    }
    sendSuccess(res, { data, message: `${role} dashboard` });
  }),

  platform: asyncHandler<AuthedRequest>(async (_req, res) => {
    const data = await cachedRead('g:platform:dash', READ_TTL, () => reportsService.platform());
    sendSuccess(res, { data });
  }),

  gym: asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.tenantId) throw ApiError.badRequest('gymId is required');
    const data = await cachedRead(`g:${req.tenantId}:dash:owner`, READ_TTL, () =>
      reportsService.gym(req.tenantId as string),
    );
    sendSuccess(res, { data });
  }),

  revenue: asyncHandler<AuthedRequest>(async (req, res) => {
    const q = (req.validatedQuery ?? {}) as { months?: number };
    const months = q.months ?? 6;
    const data = await cachedRead(`g:${req.tenantId ?? 'platform'}:revenue:${months}`, READ_TTL, () =>
      reportsService.revenueSeries({ gymId: req.tenantId, months }),
    );
    sendSuccess(res, { data });
  }),

  activity: asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.tenantId) throw ApiError.badRequest('gymId is required');
    const q = (req.validatedQuery ?? {}) as { limit?: number; page?: number };
    const limitQ = q.limit ?? 20;
    const pageQ = q.page ?? 1;
    const { items, page, limit, total } = await cachedRead(
      `g:${req.tenantId}:activity:${pageQ}:${limitQ}`,
      READ_TTL,
      () => reportsService.gymActivity(req.tenantId as string, limitQ, pageQ),
    );
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  userGrowth: asyncHandler<AuthedRequest>(async (req, res) => {
    const q = (req.validatedQuery ?? {}) as { months?: number };
    const months = q.months ?? 6;
    const data = await cachedRead(`g:platform:growth:${months}`, READ_TTL, () =>
      reportsService.userGrowth({ months }),
    );
    sendSuccess(res, { data });
  }),
};

export default reportsController;
