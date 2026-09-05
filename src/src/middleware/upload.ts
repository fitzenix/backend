import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';
import { IMPORT_MAX_FILE_BYTES, SPREADSHEET_MIME } from '../modules/imports/import.constants';

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

const spreadsheetUpload: Multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const allowedExt = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
    if (!allowedExt && !SPREADSHEET_MIME.has(file.mimetype)) {
      cb(ApiError.badRequest('Only .xlsx or .csv spreadsheets are allowed'));
      return;
    }
    cb(null, true);
  },
});

/** Single image field, e.g. uploadImage('avatar'). */
export const uploadImage = (field: string): RequestHandler => memoryUpload.single(field);

/** Multiple images, e.g. uploadImages('images', 5). */
export const uploadImages = (field: string, max = 5): RequestHandler => memoryUpload.array(field, max);

/** Single spreadsheet field for owner member import. */
export const uploadSpreadsheet = (field: string): RequestHandler => spreadsheetUpload.single(field);
