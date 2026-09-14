import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so rejected promises are forwarded to Express's
 * error middleware. Generic over the request type so handlers behind
 * `authenticate` can be typed as `AuthedRequest` for non-null `req.user` access
 * without per-call casts.
 */
export const asyncHandler =
  <Req extends Request = Request>(
    fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
  ): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req as Req, res, next)).catch(next);

export default asyncHandler;
