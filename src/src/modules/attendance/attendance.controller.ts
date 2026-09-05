import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { attendanceService } from './attendance.service';
import type { AuthedRequest } from '../../types/index';

export const attendanceController = {
  checkIn: asyncHandler<AuthedRequest>(async (req, res) => {
    const record = await attendanceService.checkIn(req, req.body);
    sendCreated(res, { data: record, message: 'Checked in' });
  }),

  bulkCheckIn: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await attendanceService.bulkCheckIn(req, req.body);
    sendSuccess(res, {
      data: result,
      message: `Checked in ${result.checkedIn} member(s)${result.failed ? `, ${result.failed} failed` : ''}`,
    });
  }),

  checkOut: asyncHandler<AuthedRequest>(async (req, res) => {
    const record = await attendanceService.checkOut(req, req.body);
    sendSuccess(res, { data: record, message: 'Checked out' });
  }),

  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await attendanceService.list(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),

  status: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await attendanceService.myStatus(req);
    sendSuccess(res, { data, message: 'Attendance status' });
  }),

  checkInQr: asyncHandler<AuthedRequest>(async (req, res) => {
    const data = await attendanceService.checkInQrInfo(req);
    sendSuccess(res, { data, message: 'Check-in QR ready' });
  }),

  checkInSticker: asyncHandler<AuthedRequest>(async (req, res) => {
    const png = await attendanceService.checkInStickerPng(req);
    const format = String((req.query as { format?: string })?.format || '').toLowerCase();
    const wantsJson =
      format === 'base64' ||
      format === 'json' ||
      String(req.headers.accept || '').includes('application/json');

    // JSON/base64 avoids RN blob-util "Download interrupted" on binary streams.
    if (wantsJson) {
      sendSuccess(res, {
        data: {
          mimeType: 'image/png',
          fileName: 'fitzenix-check-in-qr.png',
          base64: png.toString('base64'),
        },
        message: 'Check-in sticker ready',
      });
      return;
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.byteLength));
    res.setHeader('Content-Disposition', 'attachment; filename="fitzenix-check-in-qr.png"');
    res.setHeader('Cache-Control', 'no-store');
    // Skip gzip — mismatched Content-Length breaks RN file downloads.
    res.setHeader('Content-Encoding', 'identity');
    res.status(200).end(png);
  }),
};

export default attendanceController;
