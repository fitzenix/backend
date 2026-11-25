import type { Schema } from 'mongoose';
import { env } from '../config/env';
import { TTLCache } from './cache';

/** Authenticated user documents, keyed by user id. Short TTL so suspensions still take effect quickly. */
export const authUserCache = new TTLCache<string, Record<string, unknown>>(2_000, 12_000);

/** Gym documents used by the access check on every product API. */
export const gymDocCache = new TTLCache<string, Record<string, unknown>>(500, 15_000);

/** Dashboard and other read-heavy JSON payloads. */
export const responseCache = new TTLCache<string, unknown>(400, 20_000);

export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (env.isTest) return load();
  return responseCache.getOrSet(key, load as () => Promise<unknown>, ttlMs) as Promise<T>;
}

/** Drop cached reads for one gym, and the platform-wide dashboards. */
export function bustGym(gymId: unknown): void {
  responseCache.deleteWhere((key) => key.startsWith('g:platform:'));
  const id = gymId == null ? '' : String(gymId);
  if (!id || id === 'null' || id === 'undefined') return;
  responseCache.deleteWhere((key) => key.startsWith(`g:${id}:`));
  gymDocCache.delete(id);
}

export function bustUser(userId: unknown): void {
  if (userId == null) return;
  const id = String(userId);
  if (!id || id === 'null' || id === 'undefined') return;
  authUserCache.delete(id);
}

/**
 * After a write, forget cached dashboards for that gym so the next read is fresh.
 * `gymFrom: 'id'` is for the Gym model itself. `user` also forgets the auth user cache.
 */
export function invalidateReads(schema: Schema, options: { gymFrom: 'gym' | 'id'; user?: boolean }): void {
  const run = (doc: { _id?: unknown; gym?: unknown } | null | undefined) => {
    if (!doc) return;
    bustGym(options.gymFrom === 'id' ? doc._id : doc.gym);
    if (options.user) bustUser(doc._id);
  };
  schema.post('save', function (this: { _id?: unknown; gym?: unknown }) {
    run(this);
  });
  schema.post('findOneAndUpdate', (doc: { _id?: unknown; gym?: unknown } | null) => {
    run(doc);
  });
  schema.post('findOneAndDelete', (doc: { _id?: unknown; gym?: unknown } | null) => {
    run(doc);
  });
}
