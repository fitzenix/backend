/**
 * PaymentGateway contract. Concrete gateways (Razorpay, Mock, Stripe…) implement
 * this so the rest of the app never depends on a specific provider. All amounts
 * are in INR paise (integer).
 */

export interface CreateOrderInput {
  amountPaise: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, unknown>;
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  raw: unknown;
}

export interface VerifyPaymentSignatureInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signature: string | undefined;
}

export interface RefundInput {
  paymentId: string;
  amountPaise: number;
}

export interface GatewayRefund {
  id: string;
  status: string;
  amount: number;
  raw: unknown;
}

export interface PaymentGateway {
  createOrder(input: CreateOrderInput): Promise<GatewayOrder>;
  verifyPaymentSignature(input: VerifyPaymentSignatureInput): boolean;
  verifyWebhookSignature(input: VerifyWebhookInput): boolean;
  refund(input: RefundInput): Promise<GatewayRefund>;
}
