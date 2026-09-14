import crypto from 'node:crypto';
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

const MOCK_SECRET = 'mock_secret';

/**
 * Deterministic in-memory gateway for local development and tests. Signatures
 * are computed with a fixed secret so flows can be exercised end-to-end without
 * real Razorpay credentials.
 */
export class MockGateway implements PaymentGateway {
  static sign(payload: string): string {
    return crypto.createHmac('sha256', MOCK_SECRET).update(payload).digest('hex');
  }

  async createOrder({ amountPaise, currency = CURRENCY, receipt, notes }: CreateOrderInput): Promise<GatewayOrder> {
    const id = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
    return { id, amount: amountPaise, currency, raw: { id, receipt, notes, mock: true } };
  }

  verifyPaymentSignature({ orderId, paymentId, signature }: VerifyPaymentSignatureInput): boolean {
    return MockGateway.sign(`${orderId}|${paymentId}`) === signature;
  }

  verifyWebhookSignature({ rawBody, signature }: VerifyWebhookInput): boolean {
    return MockGateway.sign(rawBody) === signature;
  }

  async refund({ paymentId, amountPaise }: RefundInput): Promise<GatewayRefund> {
    return {
      id: `rfnd_mock_${crypto.randomBytes(6).toString('hex')}`,
      status: 'processed',
      amount: amountPaise,
      raw: { paymentId, mock: true },
    };
  }
}

export default MockGateway;
