import { z } from 'zod';

/** 24-char hex Mongo ObjectId. */
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const idParam = z.object({ id: objectId });

/** Base list/pagination query shared by every list endpoint. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  search: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;
export type IdParam = z.infer<typeof idParam>;
