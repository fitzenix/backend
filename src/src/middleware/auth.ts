import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyAccessToken } from '../utils/tokens';
import { User } from '../modules/users/user.model';
import { USER_STATUS } from '../config/constants';

function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/** Require a valid access token. Attaches the fresh user document to req.user. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) throw ApiError.unauthorized('Missing bearer token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');
  if (user.status === USER_STATUS.SUSPENDED) throw ApiError.forbidden('Account suspended');

  req.user = user;
  req.auth = payload;
  next();
});

/** Optional auth — attaches req.user if a valid token is present, else continues. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (user && !user.deletedAt) {
      req.user = user;
      req.auth = payload;
    }
  } catch {
    /* ignore — treated as anonymous */
  }
  next();
});
