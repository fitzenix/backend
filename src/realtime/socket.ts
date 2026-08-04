import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/tokens';
import { User, type UserDocument } from '../modules/users/user.model';
import { chatService } from '../modules/chat/chat.service';
import { Conversation } from '../modules/chat/conversation.model';
import { setIo, emitToConversation } from './emitter';
import { logger } from '../config/logger';
import { env } from '../config/env';
import type { Ctx } from '../types/index';

type AuthedSocket = Socket & { user: UserDocument };
type Ack = ((response: { ok: boolean; error?: string; message?: unknown }) => void) | undefined;

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : 'error');
const ctxOf = (user: UserDocument): Ctx => ({ user, tenantId: user.gym ? String(user.gym) : null });

/**
 * Initialise Socket.IO: JWT handshake auth, per-user/per-gym rooms, and the
 * trainer<->member chat channel (join, send, typing, read).
 */
export function initSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins.length ? env.corsOrigins : '*', credentials: true },
  });
  setIo(io);

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.authorization ?? '';
      const token = (socket.handshake.auth?.token as string | undefined) || header.replace('Bearer ', '');
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.deletedAt) return next(new Error('unauthorized'));
      (socket as AuthedSocket).user = user;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { user } = socket as AuthedSocket;
    socket.join(`user:${user._id}`);
    if (user.gym) socket.join(`gym:${user.gym}`);
    logger.debug({ userId: String(user._id) }, 'socket connected');

    socket.on('chat:join', async (conversationId: string, ack: Ack) => {
      try {
        const convo = await Conversation.findById(conversationId);
        if (!convo || !convo.participants.some((p) => String(p) === String(user._id))) {
          return ack?.({ ok: false, error: 'forbidden' });
        }
        socket.join(`conversation:${conversationId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'error' });
      }
    });

    socket.on('chat:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('chat:send', async ({ conversationId, text }: { conversationId: string; text: string }, ack: Ack) => {
      try {
        const message = await chatService.sendMessage(ctxOf(user), conversationId, text);
        ack?.({ ok: true, message: message.toJSON() });
      } catch (err) {
        ack?.({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('chat:typing', ({ conversationId, typing }: { conversationId: string; typing: boolean }) => {
      emitToConversation(conversationId, 'chat:typing', {
        conversationId,
        userId: String(user._id),
        name: user.name,
        typing: Boolean(typing),
      });
    });

    socket.on('chat:read', async ({ conversationId }: { conversationId: string }, ack: Ack) => {
      try {
        await chatService.markRead(ctxOf(user), conversationId);
        emitToConversation(conversationId, 'chat:read', { conversationId, userId: String(user._id) });
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: errorMessage(err) });
      }
    });

    socket.on('disconnect', () => {
      logger.debug({ userId: String(user._id) }, 'socket disconnected');
    });
  });

  return io;
}

export default initSocket;
