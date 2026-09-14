import dns from 'node:dns';
import mongoose, { type Connection } from 'mongoose';
import { env } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);

/** Prefer IPv4 — some ISP DNS (esp. IPv6) return EREFUSED on MongoDB SRV lookups. */
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // older Node
}

const DNS_TRANSIENT = new Set(['EREFUSED', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ESERVFAIL']);

function isTransientDnsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  const message = String((err as Error)?.message ?? '');
  return (
    (code != null && DNS_TRANSIENT.has(code)) ||
    message.includes('querySrv') ||
    message.includes('ECONNREFUSED')
  );
}

function usePublicDns(): void {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  logger.warn('Switched to public DNS (8.8.8.8 / 1.1.1.1) after Mongo SRV lookup failure');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Connect to MongoDB. Accepts an optional URI override (used by tests with an
 * in-memory server). Retries transient DNS / network failures common with Atlas `mongodb+srv`.
 */
export async function connectDB(uri: string = env.mongoUri): Promise<Connection> {
  const maxAttempts = env.isProd ? 5 : 8;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10_000,
        autoIndex: !env.isProd,
      });
      logger.info('MongoDB connected');
      return mongoose.connection;
    } catch (err) {
      lastErr = err;
      logger.error({ err, attempt, maxAttempts }, 'MongoDB connection failed');

      if (!isTransientDnsError(err) || attempt === maxAttempts) {
        break;
      }

      // After first SRV/DNS failure, bypass flaky ISP resolvers.
      if (attempt === 1) {
        usePublicDns();
      }

      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      logger.info({ delayMs }, 'Retrying MongoDB connection');
      await sleep(delayMs);
    }
  }

  throw lastErr;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export default connectDB;
