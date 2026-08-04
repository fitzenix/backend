import type { Server } from 'socket.io';

/**
 * Thin indirection around the Socket.IO server so any module can emit events
 * without a hard dependency on socket wiring (and so tests run without sockets).
 */
let io: Server | null = null;

export function setIo(instance: Server): void {
  io = instance;
}

export function getIo(): Server | null {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function emitToGym(gymId: string, event: string, payload: unknown): void {
  if (!io || !gymId) return;
  io.to(`gym:${gymId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  if (!io || !conversationId) return;
  io.to(`conversation:${conversationId}`).emit(event, payload);
}
