import crypto from 'node:crypto';
import type { Model } from 'mongoose';

export function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Generate a slug unique within a Mongoose model, appending a short random
 * suffix on collision.
 */
export async function uniqueSlug<T>(
  model: Model<T>,
  text: string,
  field = 'slug',
): Promise<string> {
  const base = slugify(text) || 'item';
  let candidate = base;
  // eslint-disable-next-line no-await-in-loop
  while (await model.exists({ [field]: candidate } as Record<string, unknown>)) {
    candidate = `${base}-${crypto.randomBytes(2).toString('hex')}`;
  }
  return candidate;
}
