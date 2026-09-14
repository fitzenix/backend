import type { Response } from 'express';
import type { PaginationMeta } from '../types/index';

interface SendOptions<T> {
  data?: T;
  message?: string;
  meta?: unknown;
  status?: number;
}

/** Consistent success envelope: { success, data, message, meta }. */
export function sendSuccess<T>(
  res: Response,
  { data = null as T, message = 'OK', meta, status = 200 }: SendOptions<T> = {},
): Response {
  const body: Record<string, unknown> = { success: true, message, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated<T>(
  res: Response,
  { data = null as T, message = 'Created', meta }: SendOptions<T> = {},
): Response {
  return sendSuccess(res, { data, message, meta, status: 201 });
}

/** Build pagination meta for list endpoints. */
export function paginationMeta({
  page,
  limit,
  total,
}: {
  page: number;
  limit: number;
  total: number;
}): PaginationMeta {
  return { page, limit, total, totalPages: limit > 0 ? Math.ceil(total / limit) : 0 };
}
