import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validate and coerce req.body / req.query / req.params against Zod schemas.
 * Parsed body/params replace the originals; parsed query is stored on
 * `req.validatedQuery` (Express 5 makes `req.query` read-only).
 */
export const validate =
  (schemas: ValidationSchemas = {}): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query ?? {});
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {}) as typeof req.params;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          ApiError.unprocessable(
            'Validation failed',
            err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };

export default validate;
