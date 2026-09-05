import http from 'node:http';
import { createApp } from './app';
import { connectDB } from './config/db';
import { initSocket } from './realtime/socket';
import { startScheduler } from './jobs/scheduler';
import { env } from './config/env';
import { logger } from './config/logger';

async function bootstrap(): Promise<void> {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);
  startScheduler();

  server.listen(env.port, () => {
    logger.info(`Fitzenix API listening on :${env.port} (${env.nodeEnv})`);
    logger.info(`Docs at http://localhost:${env.port}/api/docs`);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaughtException');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
