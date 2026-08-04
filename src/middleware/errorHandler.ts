import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError, type ErrorCode } from '../utils/ApiError';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

interface MongoDuplicateError {
  code: number;
  keyValue?: Record<string, unknown>;
}

/**
 * Central error handler. Normalises Zod, Mongoose and generic errors into the
 * standard error envelope: { success:false, error:{ code, message, details } }.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let code: ErrorCode = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    code = 'BAD_REQUEST';
    message = `Invalid value for '${err.path}'`;
  } else if ((err as MongoDuplicateError)?.code === 11000) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Duplicate value violates a unique constraint';
    details = (err as MongoDuplicateError).keyValue;
  } else if ((err as { type?: string })?.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload too large';
  }

  if (statusCode >= 500) logger.error({ err, path: req.originalUrl }, 'Unhandled error');

  const body: Record<string, unknown> = { success: false, error: { code, message } };
  if (details !== undefined) (body.error as Record<string, unknown>).details = details;
  if (!env.isProd && statusCode >= 500) {
    (body.error as Record<string, unknown>).stack = (err as Error)?.stack;
  }

  res.status(statusCode).json(body);
};
