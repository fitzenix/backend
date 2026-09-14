import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { ROLES, type Role } from '../config/constants';

/**
 * Restrict a route to one or more roles. Uses a Set for O(1) role checks.
 * Usage: router.get('/', authenticate, authorize(ROLES.GYM_OWNER), handler)
 */
export const authorize = (...roles: Role[]): RequestHandler => {
  const allowed = new Set<Role>(roles);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (allowed.size > 0 && !allowed.has(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
};

/** Convenience: super_admin only. */
export const superAdminOnly = authorize(ROLES.SUPER_ADMIN);
