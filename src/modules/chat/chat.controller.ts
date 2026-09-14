import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess, sendCreated, paginationMeta } from '../../utils/apiResponse';
import { chatService } from './chat.service';
import type { AuthedRequest } from '../../types/index';

export const chatController = {
  open: asyncHandler<AuthedRequest>(async (req, res) => {
    const conversation = await chatService.openConversation(req, req.body.userId);
    sendSuccess(res, { data: conversation, message: 'Conversation ready' });
  }),
  listConversations: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await chatService.listConversations(req);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  listMessages: asyncHandler<AuthedRequest>(async (req, res) => {
    const { items, page, limit, total } = await chatService.listMessages(req, req.params.id);
    sendSuccess(res, { data: items, meta: paginationMeta({ page, limit, total }) });
  }),
  sendMessage: asyncHandler<AuthedRequest>(async (req, res) => {
    const message = await chatService.sendMessage(req, req.params.id, req.body.text);
    sendCreated(res, { data: message, message: 'Message sent' });
  }),
  markRead: asyncHandler<AuthedRequest>(async (req, res) => {
    const result = await chatService.markRead(req, req.params.id);
    sendSuccess(res, { data: result, message: 'Marked read' });
  }),
};

export default chatController;
