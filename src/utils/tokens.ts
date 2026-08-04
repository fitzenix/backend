import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env';
import type { AuthTokenPayload } from '../types/index';

type AccessClaims = Pick<AuthTokenPayload, 'sub' | 'role' | 'gym'>;
type RefreshClaims = Pick<AuthTokenPayload, 'sub'>;

export function signAccessToken(payload: AccessClaims): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl as SignOptions['expiresIn'],
  });
}

export function signRefreshToken(payload: RefreshClaims): string {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AuthTokenPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as AuthTokenPayload;
}

/** SHA-256 hash used to store refresh / reset tokens (never store raw). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomToken(bytes = 40): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** 6-digit numeric OTP. */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
