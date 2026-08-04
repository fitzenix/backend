import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';

const rejectWith = (message: string) => (_req: Request, res: Response) =>
  res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });

/** Global limiter applied to the whole API. */
export const globalLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rejectWith('Too many requests, please try again later.'),
});

/** Stricter limiter for auth-sensitive endpoints (login, OTP, reset). */
export const authLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.isTest,
  handler: rejectWith('Too many attempts, please slow down.'),
});
