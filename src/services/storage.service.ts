import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { StorageObject } from '../types/index';

export interface UploadInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folder?: string;
}

/**
 * Storage abstraction. Swappable driver: `local` (writes to UPLOAD_DIR, served
 * via /uploads) or `s3` (any S3-compatible bucket). The AWS SDK is imported
 * lazily so the app runs without it when using the local driver.
 */
class StorageService {
  private readonly driver = env.storage.driver;
  private s3Client: S3Client | null = null;

  private key(folder: string, originalName: string): string {
    const ext = path.extname(originalName || '').toLowerCase();
    return `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  }

  private async getS3(): Promise<S3Client> {
    if (this.s3Client) return this.s3Client;
    const { S3Client: Client } = await import('@aws-sdk/client-s3');
    this.s3Client = new Client({
      region: env.storage.s3.region,
      endpoint: env.storage.s3.endpoint || undefined,
      forcePathStyle: Boolean(env.storage.s3.endpoint),
      credentials: {
        accessKeyId: env.storage.s3.accessKey,
        secretAccessKey: env.storage.s3.secretKey,
      },
    });
    return this.s3Client;
  }

  async upload({ buffer, originalName, mimeType, folder = 'misc' }: UploadInput): Promise<StorageObject> {
    const key = this.key(folder, originalName);

    if (this.driver === 's3') {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3 = await this.getS3();
      await s3.send(
        new PutObjectCommand({ Bucket: env.storage.s3.bucket, Key: key, Body: buffer, ContentType: mimeType }),
      );
      const base =
        env.storage.s3.publicBaseUrl ||
        env.storage.s3.endpoint ||
        `https://${env.storage.s3.bucket}.s3.${env.storage.s3.region}.amazonaws.com`;
      return { key, url: `${base.replace(/\/$/, '')}/${key}` };
    }

    const dest = path.join(env.storage.uploadDir, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return { key, url: `/uploads/${key}` };
  }

  async delete(key: string | undefined): Promise<void> {
    if (!key) return;
    try {
      if (this.driver === 's3') {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = await this.getS3();
        await s3.send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
      } else {
        await fs.unlink(path.join(env.storage.uploadDir, key)).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, key }, 'Failed to delete stored file');
    }
  }
}

export const storageService = new StorageService();
export default storageService;
