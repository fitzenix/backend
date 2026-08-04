import type { Types } from 'mongoose';
import { Conversation, type ConversationDocument } from './conversation.model';
import { Message, type MessageDocument } from './message.model';
import { User } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, type Role } from '../../config/constants';
import { parseListQuery } from '../../utils/pagination';
import { emitToUser, emitToConversation } from '../../realtime/emitter';
import { notificationService } from '../notifications/notification.service';
import type { Ctx, Paginated } from '../../types/index';

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

function isParticipant(conversation: ConversationDocument, userId: Types.ObjectId | string): boolean {
  return conversation.participants.some((p) => String(p) === String(userId));
}

export const chatService = {
  /** Find or create a 1:1 conversation between the current user and another user. */
  async openConversation(ctx: Ctx, otherUserId: string): Promise<ConversationDocument> {
    const gym = requireTenant(ctx);
    if (String(otherUserId) === String(ctx.user._id)) {
      throw ApiError.badRequest('Cannot start a conversation with yourself');
    }
    const other = await User.findOne({ _id: otherUserId, gym, deletedAt: null });
    if (!other) throw ApiError.notFound('User not found in this gym');

    const pair: Role[] = [ctx.user.role, other.role];
    const validPair = pair.includes(ROLES.TRAINER) && pair.includes(ROLES.MEMBER);
    const isStaff = ctx.user.role === ROLES.GYM_OWNER || ctx.user.role === ROLES.SUPER_ADMIN;
    if (!validPair && !isStaff) {
      throw ApiError.forbidden('Chat is only available between trainers and members');
    }

    const participants = [ctx.user._id, other._id];
    let conversation = await Conversation.findOne({ gym, participants: { $all: participants, $size: 2 } });
    if (!conversation) conversation = await Conversation.create({ gym, participants });
    return conversation.populate('participants', 'name avatar role');
  },

  async listConversations(ctx: Ctx): Promise<Paginated<ConversationDocument>> {
    const gym = requireTenant(ctx);
    const { page, limit, skip } = parseListQuery(ctx.validatedQuery ?? {});
    const filter = { gym, participants: ctx.user._id };
    const [items, total] = await Promise.all([
      Conversation.find(filter)
        .sort({ 'lastMessage.at': -1, updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants', 'name avatar role'),
      Conversation.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  async getConversationForUser(ctx: Ctx, conversationId: string): Promise<ConversationDocument> {
    const conversation = await Conversation.findOne({ _id: conversationId, gym: requireTenant(ctx) });
    if (!conversation) throw ApiError.notFound('Conversation not found');
    if (!isParticipant(conversation, ctx.user._id) && ctx.user.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Not a participant of this conversation');
    }
    return conversation;
  },

  async listMessages(ctx: Ctx, conversationId: string): Promise<Paginated<MessageDocument>> {
    await this.getConversationForUser(ctx, conversationId);
    const { page, limit, skip } = parseListQuery(ctx.validatedQuery ?? {});
    const filter = { conversation: conversationId };
    const [items, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sender', 'name avatar'),
      Message.countDocuments(filter),
    ]);
    return { items: items.reverse(), page, limit, total };
  },

  /** Persist a message, update summary + unread counts, and emit in real time. */
  async sendMessage(ctx: Ctx, conversationId: string, text: string): Promise<MessageDocument> {
    const gym = requireTenant(ctx);
    const conversation = await this.getConversationForUser(ctx, conversationId);
    const message = await Message.create({
      conversation: conversation._id,
      gym,
      sender: ctx.user._id,
      text,
      readBy: [ctx.user._id],
    });

    conversation.lastMessage = { text, sender: ctx.user._id, at: message.createdAt };
    for (const p of conversation.participants) {
      const key = String(p);
      if (key !== String(ctx.user._id)) conversation.unread.set(key, (conversation.unread.get(key) ?? 0) + 1);
    }
    await conversation.save();

    const populated = await message.populate('sender', 'name avatar');
    emitToConversation(String(conversation._id), 'chat:message', populated.toJSON());

    for (const p of conversation.participants) {
      if (String(p) === String(ctx.user._id)) continue;
      emitToUser(String(p), 'chat:message', populated.toJSON());
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify({
        gym,
        user: p,
        type: 'chat',
        title: `New message from ${ctx.user.name}`,
        body: text.slice(0, 120),
        data: { conversationId: String(conversation._id) },
      });
    }
    return populated;
  },

  async markRead(ctx: Ctx, conversationId: string): Promise<{ ok: true }> {
    const conversation = await this.getConversationForUser(ctx, conversationId);
    conversation.unread.set(String(ctx.user._id), 0);
    await conversation.save();
    await Message.updateMany(
      { conversation: conversationId, readBy: { $ne: ctx.user._id } },
      { $addToSet: { readBy: ctx.user._id } },
    );
    return { ok: true };
  },
};

export default chatService;
