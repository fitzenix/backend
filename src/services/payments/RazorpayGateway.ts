import crypto from 'node:crypto';
import { env } from '../../config/env';
import { CURRENCY } from '../../config/constants';
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
    const RazorpayCtor = (await import('razorpay')).default as unknown as new (opts: {
      key_id: string;
      key_secret: string;
    }) => RazorpayClient;
    this.client = new RazorpayCtor({
      key_id: env.payments.razorpay.keyId,
      key_secret: env.payments.razorpay.keySecret,
    });
    return this.client;
  }

  async createOrder({ amountPaise, currency = CURRENCY, receipt, notes }: CreateOrderInput): Promise<GatewayOrder> {
    const client = await this.getClient();
    const order = await client.orders.create({ amount: amountPaise, currency, receipt, notes });
    return { id: order.id, amount: order.amount, currency: order.currency, raw: order };
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
    const refund = await client.payments.refund(paymentId, { amount: amountPaise });
    return { id: refund.id, status: refund.status, amount: refund.amount, raw: refund };
  }
}

function safeEqual(expected: string, actual: string | undefined): boolean {
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual ?? ''));
  } catch {
    return false;
  }
}

export default RazorpayGateway;
