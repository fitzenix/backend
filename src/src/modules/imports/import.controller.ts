import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/apiResponse';
import { ApiError } from '../../utils/ApiError';
import type { AuthedRequest } from '../../types/index';
import { buildTemplate } from './import.template';
import { importService } from './import.service';

function templateKind(value: string | undefined): 'xlsx' | 'csv' {
  return value === 'csv' ? 'csv' : 'xlsx';
}

export const importController = {
  downloadTemplate: asyncHandler<AuthedRequest>(async (req, res) => {
    const kind = templateKind(req.params.kind);
    const file = buildTemplate(kind);
    if (String(req.query.format || '').toLowerCase() === 'base64') {
      sendSuccess(res, {
        data: {
          filename: file.filename,
          mime: file.mime,
          base64: file.buffer.toString('base64'),
        },
      });
      return;
    }
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  }),

  importMembers: asyncHandler<AuthedRequest>(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('Upload a .xlsx or .csv file in the "file" field.');
    const data = await importService.importMembers(req, req.file);
    sendSuccess(res, { data, message: 'Import finished' });
  }),
};

export default importController;
