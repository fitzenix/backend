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
  /** Stable Cloudinary public id (without folder). Enables overwrite for avatars. */
  publicId?: string;
}

/**
 * Storage abstraction. Swappable driver: `local` (writes to UPLOAD_DIR, served
 * via /uploads), `s3` (any S3-compatible bucket), or `cloudinary`.
 * The AWS / Cloudinary SDKs are imported lazily so unused drivers stay cheap.
 */
class StorageService {
  private readonly driver = env.storage.driver;
  private s3Client: S3Client | null = null;
  private cloudinaryConfigured = false;

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

  private async getCloudinary() {
    const { v2: cloudinary } = await import('cloudinary');
    if (!this.cloudinaryConfigured) {
      const { cloudName, apiKey, apiSecret } = env.storage.cloudinary;
      if (!cloudName || !apiKey || !apiSecret) {
        throw new Error(
          'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
        );
      }
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.cloudinaryConfigured = true;
    }
    return cloudinary;
  }

  private async uploadCloudinary({
    buffer,
    originalName,
    mimeType,
    folder = 'misc',
    publicId,
  }: UploadInput): Promise<StorageObject> {
    const cloudinary = await this.getCloudinary();
    const ext = path.extname(originalName || '').replace('.', '') || undefined;
    const resourceType = mimeType.startsWith('image/') ? 'image' : 'auto';

    const result = await new Promise<{
      public_id: string;
      secure_url: string;
    }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          overwrite: Boolean(publicId),
          invalidate: Boolean(publicId),
          resource_type: resourceType,
          format: ext,
        },
        (err, res) => {
          if (err || !res) reject(err ?? new Error('Cloudinary upload failed'));
          else resolve({ public_id: res.public_id, secure_url: res.secure_url });
        },
      );
      stream.end(buffer);
    });

    return { key: result.public_id, url: result.secure_url };
  }

  async upload(input: UploadInput): Promise<StorageObject> {
    const { buffer, originalName, mimeType, folder = 'misc' } = input;

    if (this.driver === 'cloudinary') {
      return this.uploadCloudinary(input);
    }

    // Member profiles always prefer Cloudinary when credentials exist.
    if (
      folder.startsWith('Members Profile') &&
      env.storage.cloudinary.cloudName &&
      env.storage.cloudinary.apiKey &&
      env.storage.cloudinary.apiSecret
    ) {
      return this.uploadCloudinary(input);
    }

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
      if (this.driver === 'cloudinary' || key.includes('Members Profile')) {
        const cloudinary = await this.getCloudinary().catch(() => null);
        if (cloudinary) {
          await cloudinary.uploader.destroy(key);
          return;
        }
      }
      if (this.driver === 's3') {
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3 = await this.getS3();
        await s3.send(new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: key }));
      } else if (this.driver === 'local') {
        await fs.unlink(path.join(env.storage.uploadDir, key)).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err, key }, 'Failed to delete stored file');
    }
  }
}

export const storageService = new StorageService();
export default storageService;
