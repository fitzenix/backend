import type { SortOrder } from 'mongoose';

export interface ListQueryInput {
  page?: number | string;
  limit?: number | string;
  sort?: string;
  order?: string;
  search?: string;
}

export interface ParsedListQuery {
  page: number;
  limit: number;
  skip: number;
  sort: Record<string, SortOrder>;
  order: SortOrder;
  search: string;
  sortField: string;
}

/**
 * Parse standard list query params: page, limit, sort, order, search.
 * Returns normalised values plus a Mongoose-friendly sort object.
 */
export function parseListQuery(
  query: ListQueryInput = {},
  { defaultSort = 'createdAt', maxLimit = 100 }: { defaultSort?: string; maxLimit?: number } = {},
): ParsedListQuery {
  const page = Math.max(1, Number.parseInt(String(query.page ?? ''), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(String(query.limit ?? ''), 10) || 20));
  const skip = (page - 1) * limit;

  const sortField = String(query.sort || defaultSort);
  const order: SortOrder = String(query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const sort: Record<string, SortOrder> = { [sortField]: order };

  const search = query.search ? String(query.search).trim() : '';

  return { page, limit, skip, sort, order, search, sortField };
}

/** Escape user input before using it inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive regex OR filter across the given fields for a search term. */
export function buildSearchFilter(
  search: string,
  fields: string[] = [],
): Record<string, unknown> {
  if (!search || fields.length === 0) return {};
  const rx = new RegExp(escapeRegExp(search), 'i');
  return { $or: fields.map((f) => ({ [f]: rx })) };
}
