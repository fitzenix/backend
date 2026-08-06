import type { Message } from 'firebase-admin/messaging';
import { getMessaging } from './admin';
import { logger } from '../config/logger';
import { sleep } from '../utils/sleep';

const MAX_RETRIES = 3;
const BATCH_SIZE = 500; // FCM multicast hard limit

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  androidChannelId?: string;
  collapseKey?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  invalidToken?: boolean;
}

function toDataStrings(data: Record<string, unknown> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function buildMessage(token: string, payload: PushPayload): Message {
  const data = toDataStrings(payload.data);
  return {
    token,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    data: {
      ...data,
      title: payload.title,
      body: payload.body,
    },
    android: {
      priority: 'high',
      collapseKey: payload.collapseKey,
      notification: {
        channelId: payload.androidChannelId ?? 'fitzenix_default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
          contentAvailable: true,
          mutableContent: true,
        },
      },
    },
  };
}

function isInvalidTokenError(code?: string): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

function isRetryable(code?: string): boolean {
  return (
    code === 'messaging/internal-error' ||
    code === 'messaging/server-unavailable' ||
    code === 'messaging/unknown-error' ||
    code === 'messaging/message-rate-exceeded' ||
    code === 'messaging/quota-exceeded'
  );
}

async function sendOnce(token: string, payload: PushPayload): Promise<SendResult> {
  const messaging = getMessaging();
  if (!messaging) {
    return { success: false, errorCode: 'firebase_disabled', errorMessage: 'Firebase not configured' };
  }

  try {
    const messageId = await messaging.send(buildMessage(token, payload));
    return { success: true, messageId };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorCode: code,
      errorMessage: message,
      invalidToken: isInvalidTokenError(code),
    };
  }
}

/**
 * Send to a single device with exponential backoff (up to 3 attempts).
 */
export async function sendToToken(
  token: string,
  payload: PushPayload,
  maxRetries = MAX_RETRIES,
): Promise<SendResult & { retries: number }> {
  let last: SendResult = { success: false };
  let retries = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      retries = attempt;
      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(delayMs);
    }

    last = await sendOnce(token, payload);
    if (last.success || last.invalidToken || !isRetryable(last.errorCode)) {
      if (!last.success) {
        logger.warn(
          { token: token.slice(0, 12), code: last.errorCode, attempt },
          'FCM send failed',
        );
      }
      return { ...last, retries };
    }
  }

  return { ...last, retries };
}

/**
 * Batch-send to many tokens (chunked at 500). Returns per-token outcomes.
 */
export async function sendToTokens(
  tokens: string[],
  payload: PushPayload,
): Promise<Array<{ token: string } & SendResult & { retries: number }>> {
  const results: Array<{ token: string } & SendResult & { retries: number }> = [];
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const chunk = tokens.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (token) => {
        const r = await sendToToken(token, payload);
        return { token, ...r };
      }),
    );
    results.push(...chunkResults);
  }
  return results;
}

export async function sendToTopic(topic: string, payload: PushPayload): Promise<SendResult> {
  const messaging = getMessaging();
  if (!messaging) {
    return { success: false, errorCode: 'firebase_disabled', errorMessage: 'Firebase not configured' };
  }

  try {
    const messageId = await messaging.send({
      topic,
      notification: { title: payload.title, body: payload.body },
      data: toDataStrings(payload.data),
      android: {
        priority: 'high',
        notification: { channelId: payload.androidChannelId ?? 'fitzenix_default', sound: 'default' },
      },
      apns: { payload: { aps: { sound: 'default', contentAvailable: true } } },
    });
    return { success: true, messageId };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    logger.error({ err, topic }, 'FCM topic send failed');
    return {
      success: false,
      errorCode: code,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function subscribeTokensToTopic(tokens: string[], topic: string): Promise<void> {
  const messaging = getMessaging();
  if (!messaging || tokens.length === 0) return;
  try {
    await messaging.subscribeToTopic(tokens, topic);
  } catch (err) {
    logger.warn({ err, topic, count: tokens.length }, 'Topic subscribe failed');
  }
}

export async function unsubscribeTokensFromTopic(tokens: string[], topic: string): Promise<void> {
  const messaging = getMessaging();
  if (!messaging || tokens.length === 0) return;
  try {
    await messaging.unsubscribeFromTopic(tokens, topic);
  } catch (err) {
    logger.warn({ err, topic, count: tokens.length }, 'Topic unsubscribe failed');
  }
}

export const fcmService = {
  sendToToken,
  sendToTokens,
  sendToTopic,
  subscribeTokensToTopic,
  unsubscribeTokensFromTopic,
};

export default fcmService;
