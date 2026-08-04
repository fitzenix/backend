import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const memoryUpload: Multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_TYPES.has(file.mimetype)) {
      cb(ApiError.badRequest('Only JPEG, PNG, WEBP or GIF images are allowed'));
      return;
    }
    cb(null, true);
  },
});

/** Single image field, e.g. uploadImage('avatar'). */
export const uploadImage = (field: string): RequestHandler => memoryUpload.single(field);

/** Multiple images, e.g. uploadImages('images', 5). */
export const uploadImages = (field: string, max = 5): RequestHandler => memoryUpload.array(field, max);
