import type { Request, Response, NextFunction } from 'express';
import { Gym } from '../modules/gyms/gym.model';
import { ApiError } from '../utils/ApiError';
import { GYM_FEATURES, ROLES, type GymFeature } from '../config/constants';
import { asyncHandler } from '../utils/asyncHandler';
import { billingService } from '../modules/billing/billing.service';
import { computeGymAccess, hasGymFeature, lockedMessageForRole } from '../modules/billing/billing.access';
import { env } from '../config/env';
import { gymDocCache } from '../utils/hotCache';

/**
 * Blocks product APIs when the gym trial or paid plan has lapsed.
 * Super-admins always pass. Auth + billing routes must NOT use this middleware.
 */
export const requireActiveGym = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role === ROLES.SUPER_ADMIN) return next();
  if (!req.user.gym) return next(ApiError.forbidden('User is not associated with any gym'));

  const gymId = String(req.user.gym);
  const cached = env.isTest ? undefined : gymDocCache.get(gymId);
  const gym = cached
    ? Gym.hydrate(cached)
    : await Gym.findOne({ _id: req.user.gym, deletedAt: null });
  if (!gym) return next(ApiError.notFound('Gym not found'));

  await billingService.ensureFresh(gym);
  if (!env.isTest) gymDocCache.set(gymId, gym.toObject() as unknown as Record<string, unknown>);
  const access = computeGymAccess(gym);
  req.gymAccess = access;

  if (!access.allowed) {
    throw ApiError.gymLocked(lockedMessageForRole(req.user.role, access), access);
  }

  const staffRole =
    req.user.role === ROLES.TRAINER || req.user.role === ROLES.STAFF || req.user.role === ROLES.MEMBER;
  if (staffRole && !hasGymFeature(access, GYM_FEATURES.APPS)) {
    throw ApiError.gymLocked(
      'This gym plan does not include the Trainer or Member app. Ask the gym owner to upgrade.',
      access,
    );
  }

  next();
});

/** Extra plan-feature gate. Call after `requireActiveGym` so `req.gymAccess` is set. */
export function requireGymFeature(feature: GymFeature) {
  return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === ROLES.SUPER_ADMIN) return next();
    const access = req.gymAccess;
    if (!access || !hasGymFeature(access, feature)) {
      throw ApiError.forbidden('This feature is not included in your current Fitzenix plan. Please upgrade.');
    }
    next();
  });
}
