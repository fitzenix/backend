import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import path from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { swaggerSpec } from './config/swagger';
import { globalLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import apiRoutes from './routes';

/** Build and configure the Express application (no listening — see server.ts). */
export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true, credentials: true }));
  app.use(
    compression({
      filter: (req, res) => {
        // Never gzip check-in stickers — RN blob clients treat length mismatch as interrupt.
        if (req.url?.includes('/attendance/check-in-sticker')) return false;
        if (req.url?.includes('/imports/template')) return false;
        if (res.getHeader('Content-Type') === 'image/png') return false;
        return compression.filter(req, res);
      },
    }),
  );

  // Capture the raw body so payment webhooks can verify signatures.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));

  if (!env.isTest) {
    app.use(morgan(env.isProd ? 'combined' : 'dev', { stream: { write: (msg) => logger.info(msg.trim()) } }));
  }

  app.use(globalLimiter);

  // Serve locally-stored uploads (when STORAGE_DRIVER=local).
  app.use('/uploads', express.static(path.resolve(env.storage.uploadDir)));

  app.get('/health', (_req: Request, res: Response) =>
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } }),
  );

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Fitzenix API' }));
  app.get('/api/docs.json', (_req: Request, res: Response) => res.json(swaggerSpec));

  app.use(env.apiPrefix, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
