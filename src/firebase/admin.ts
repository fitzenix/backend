import {
  initializeApp,
  getApps,
  getApp,
  cert,
  type App,
} from 'firebase-admin/app';
import { getMessaging as getAdminMessaging, type Messaging } from 'firebase-admin/messaging';
import { env } from '../config/env';
import { logger } from '../config/logger';

let cachedApp: App | null = null;

/**
 * Lazily initialise the Firebase Admin SDK once per process.
 * When FIREBASE_ENABLED=false the app still boots; push calls no-op gracefully.
 */
export function getFirebaseApp(): App | null {
  if (!env.firebase.enabled) return null;
  if (cachedApp) return cachedApp;

  if (getApps().length > 0) {
    cachedApp = getApp();
    return cachedApp;
  }

  const { projectId, clientEmail, privateKey } = env.firebase;
  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('Firebase enabled but credentials incomplete — push disabled');
    return null;
  }

  try {
    cachedApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    logger.info({ projectId }, 'Firebase Admin initialised');
    return cachedApp;
  } catch (err) {
    logger.error({ err }, 'Firebase Admin initialisation failed');
    return null;
  }
}

export function getMessaging(): Messaging | null {
  const app = getFirebaseApp();
  return app ? getAdminMessaging(app) : null;
}

export default getFirebaseApp;
