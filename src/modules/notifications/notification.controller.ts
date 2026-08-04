import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, paginationMeta } from '../../utils/apiResponse';
import { notificationService } from './notification.service';
import type { AuthedRequest } from '../../types/index';

export const notificationController = {
  list: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total, unread } = await notificationService.list(req);
    sendSuccess(res, { data: items, meta: { ...paginationMeta({ page, limit, total }), unread } });
  }),

  markRead: asyncHandler<AuthedRequest>(async (req, res) => {
    const n = await notificationService.markRead(req, req.params.id);
    sendSuccess(res, { data: n, message: 'Marked as read' });
  }),

  markAllRead: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await notificationService.markAllRead(req);
    sendSuccess(res, { data: result, message: 'All notifications marked read' });
  }),
};

export default notificationController;
