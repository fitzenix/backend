export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

/**
 * Operational error carrying an HTTP status, a machine-readable code, and
 * optional structured details. Thrown anywhere; caught by the central handler.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Unauthorized', details?: unknown): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message, details);
  }

  static forbidden(message = 'Forbidden', details?: unknown): ApiError {
    return new ApiError(403, 'FORBIDDEN', message, details);
  }

  static notFound(message = 'Resource not found', details?: unknown): ApiError {
    return new ApiError(404, 'NOT_FOUND', message, details);
  }

  static conflict(message = 'Conflict', details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static unprocessable(message = 'Validation failed', details?: unknown): ApiError {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  static tooMany(message = 'Too many requests', details?: unknown): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }

  static internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  }
}

export default ApiError;
