import crypto from 'node:crypto';
import { env } from '../../config/env';
import { CURRENCY } from '../../config/constants';
import { ApiError } from '../../utils/ApiError';
import type {
  PaymentGateway,
  CreateOrderInput,
  GatewayOrder,
  VerifyPaymentSignatureInput,
  VerifyWebhookInput,
  RefundInput,
  GatewayRefund,
} from './PaymentGateway';

/** Minimal shape of the Razorpay SDK client (only what we use). */
interface RazorpayClient {
  orders: { create(opts: Record<string, unknown>): Promise<{ id: string; amount: number; currency: string }> };
  payments: {
    refund(paymentId: string, opts: { amount: number }): Promise<{ id: string; status: string; amount: number }>;
  };
}

/**
 * Razorpay implementation. The `razorpay` SDK is imported lazily so the app can
 * boot (and tests can run) without valid keys when using the mock gateway.
 */
export class RazorpayGateway implements PaymentGateway {
  private client: RazorpayClient | null = null;

  private async getClient(): Promise<RazorpayClient> {
    if (this.client) return this.client;
    const keyId = env.payments.razorpay.keyId;
    const keySecret = env.payments.razorpay.keySecret;
    if (!keyId || !keySecret) {
      throw ApiError.badRequest(
        'Razorpay keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, then restart the server.',
      );
    }
    const RazorpayCtor = (await import('razorpay')).default as unknown as new (opts: {
      key_id: string;
      key_secret: string;
    }) => RazorpayClient;
    this.client = new RazorpayCtor({
      key_id: keyId,
      key_secret: keySecret,
    });
    return this.client;
  }

  async createOrder({ amountPaise, currency = CURRENCY, receipt, notes, method }: CreateOrderInput): Promise<GatewayOrder> {
    const client = await this.getClient();
    const stringNotes = Object.fromEntries(
      Object.entries(notes ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
    );
    try {
      const order = await client.orders.create({
        amount: amountPaise,
        currency,
        receipt: (receipt ?? `fx_${Date.now()}`).slice(0, 40),
        notes: stringNotes,
        ...(method ? { method } : {}),
      });
      return { id: order.id, amount: order.amount, currency: order.currency, raw: order };
    } catch (err) {
      throw mapRazorpayError(err);
    }
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: VerifyPaymentSignatureInput): boolean {
    const expected = crypto
      .createHmac('sha256', env.payments.razorpay.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return safeEqual(expected, signature);
  }

  verifyWebhookSignature({ rawBody, signature }: VerifyWebhookInput): boolean {
    const expected = crypto
      .createHmac('sha256', env.payments.razorpay.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return safeEqual(expected, signature);
  }

  async refund({ paymentId, amountPaise }: RefundInput): Promise<GatewayRefund> {
    const client = await this.getClient();
    try {
      const refund = await client.payments.refund(paymentId, { amount: amountPaise });
      return { id: refund.id, status: refund.status, amount: refund.amount, raw: refund };
    } catch (err) {
      throw mapRazorpayError(err);
    }
  }
}

function mapRazorpayError(err: unknown): never {
  const e = err as { statusCode?: number; error?: { description?: string }; message?: string };
  const description = e?.error?.description || e?.message || 'Razorpay request failed';
  if (e?.statusCode === 401) {
    throw ApiError.badRequest(
      'Razorpay authentication failed. Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and restart the backend.',
    );
  }
  throw ApiError.badRequest(description);
}

function safeEqual(expected: string, actual: string | undefined): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual ?? ''));
  } catch {
    return false;
  }
}

export default RazorpayGateway;
