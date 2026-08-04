import pino, { type Logger } from 'pino';
import { env } from './env';

/**
 * App logger. Plain JSON output (no pino-pretty dependency) so it runs
 * anywhere. Pipe through `pino-pretty` in dev for colourised logs.
 */
export const logger: Logger = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
});

export default logger;
