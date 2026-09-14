import crypto from 'node:crypto';

/** Zero-padded numeric id of the given length (used for invoice sequences). */
export function numericId(length = 8): string {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

/** URL-safe random id (base36) — replaces the external nanoid dependency. */
export function randomId(bytes = 12): string {
  return crypto.randomBytes(bytes).toString('base64url');
}
