import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { ROLES } from '../config/constants';

/**
 * Multi-tenant scoping. Every non–super_admin user belongs to exactly one gym.
 *   - super_admin: may target any gym via ?gymId / :gymId / X-Gym-Id, or operate
 *     platform-wide (req.tenantId = null).
 *   - everyone else: locked to their own user.gym.
 *
 * Sets req.tenantId. Use `tenantFilter(req)` to keep queries scoped.
 */
export function resolveTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(ApiError.unauthorized());

  if (req.user.role === ROLES.SUPER_ADMIN) {
    const query = (req.validatedQuery ?? req.query) as { gymId?: string };
    const requested = req.params.gymId || query.gymId || (req.headers['x-gym-id'] as string | undefined);
    req.tenantId = requested || null;
    return next();
  }

  if (!req.user.gym) return next(ApiError.forbidden('User is not associated with any gym'));
  req.tenantId = String(req.user.gym);
  next();
}

/** Require an active tenant (rejects platform-wide access). */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantId) return next(ApiError.badRequest('A gym context (gymId) is required'));
  next();
}

/** Build a `{ gym }` filter for the current tenant (empty for platform-wide). */
export function tenantFilter(req: Request, field = 'gym'): Record<string, string> {
  return req.tenantId ? { [field]: req.tenantId } : {};
}
