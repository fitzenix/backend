import dotenv from 'dotenv';

dotenv.config();

const toNumber = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Strip inline comments and surrounding whitespace from env values. */
const envStr = (value: string | undefined, fallback = ''): string =>
  (value ?? fallback).split('#')[0].trim();

const toList = (value: string | undefined): string[] =>
  envStr(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Centralised, validated environment configuration. Every module imports from
 * here rather than reading `process.env` directly.
 */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: toNumber(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  corsOrigins: toList(process.env.CORS_ORIGINS),

  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/fitzenix',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },

  bcryptRounds: toNumber(process.env.BCRYPT_ROUNDS, 10),
  otpTtlSeconds: toNumber(process.env.OTP_TTL_SECONDS, 600),

  rateLimit: {
    windowMs: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toNumber(process.env.RATE_LIMIT_MAX, 300),
  },

  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3' | 'cloudinary',
    uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'ap-south-1',
      bucket: process.env.S3_BUCKET ?? 'fitzenix',
      accessKey: process.env.S3_ACCESS_KEY ?? '',
      secretKey: process.env.S3_SECRET_KEY ?? '',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '',
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    },
  },

  payments: {
    gateway: envStr(process.env.PAYMENT_GATEWAY, 'mock') as 'razorpay' | 'mock',
    razorpay: {
      keyId: envStr(process.env.RAZORPAY_KEY_ID),
      keySecret: envStr(process.env.RAZORPAY_KEY_SECRET),
      webhookSecret: envStr(process.env.RAZORPAY_WEBHOOK_SECRET),
    },
  },

  firebase: {
    enabled: process.env.FIREBASE_ENABLED === 'true',
    projectId: process.env.FIREBASE_PROJECT_ID ?? '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? '',
    /** Private key with escaped newlines (`\\n`) from the service-account JSON. */
    privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },

  redisUrl: process.env.REDIS_URL ?? '',

  /**
   * Transactional email. Default driver is Resend (https://resend.com/).
   * Set MAIL_DRIVER=zoho later to send through Zoho SMTP with the same templates.
   */
  mail: {
    driver: envStr(process.env.MAIL_DRIVER, 'resend') as 'resend' | 'zoho' | 'log',
    fromName: envStr(process.env.MAIL_FROM_NAME, process.env.SMTP_FROM_NAME || 'Fitzenix'),
    fromEmail: envStr(
      process.env.MAIL_FROM_EMAIL,
      process.env.SMTP_FROM_EMAIL || 'Fitzenix <onboarding@resend.dev>',
    ),
    replyTo: envStr(process.env.MAIL_REPLY_TO, process.env.SMTP_REPLY_TO || process.env.SUPPORT_EMAIL || ''),
    resendApiKey: envStr(process.env.RESEND_API_KEY),
  },

  /** Optional Zoho SMTP — used when MAIL_DRIVER=zoho. */
  smtp: {
    host: envStr(process.env.SMTP_HOST, 'smtp.zoho.in'),
    port: toNumber(process.env.SMTP_PORT, 465),
    secure: process.env.SMTP_SECURE !== 'false',
    user: envStr(process.env.SMTP_USER),
    pass: envStr(process.env.SMTP_PASS),
    fromName: envStr(process.env.SMTP_FROM_NAME, 'Fitzenix'),
    fromEmail: envStr(process.env.SMTP_FROM_EMAIL, process.env.SMTP_USER ?? 'noreply@fitzenix.com'),
    replyTo: envStr(process.env.SMTP_REPLY_TO),
  },
  app: {
    name: envStr(process.env.APP_NAME, 'Fitzenix'),
    webUrl: envStr(process.env.APP_WEB_URL, 'https://fitzenix.com'),
    supportEmail: envStr(process.env.SUPPORT_EMAIL, 'support@fitzenix.com'),
  },
} as const;

export type Env = typeof env;
export default env;
