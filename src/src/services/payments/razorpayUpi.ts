import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export type RazorpayPaymentStatus = 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';

interface RazorpayPaymentsApi {
  validateVpa(params: { vpa: string }): Promise<{ vpa: string; success: boolean; customer_name?: string }>;
  createUpi(params: Record<string, unknown>): Promise<{ razorpay_payment_id: string; link?: string }>;
  fetch(paymentId: string): Promise<{ id: string; status: RazorpayPaymentStatus; order_id: string }>;
}

interface RazorpayOrdersApi {
  create(opts: Record<string, unknown>): Promise<{ id: string; amount: number; currency: string }>;
}

export interface RazorpayFullClient {
  orders: RazorpayOrdersApi;
  payments: RazorpayPaymentsApi;
}

let client: RazorpayFullClient | null = null;

export async function getRazorpayClient(): Promise<RazorpayFullClient> {
  if (client) return client;
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
  }) => RazorpayFullClient;
  client = new RazorpayCtor({ key_id: keyId, key_secret: keySecret });
  return client;
}

export function mapRazorpayError(err: unknown): never {
  const e = err as { statusCode?: number; error?: { description?: string }; message?: string };
  const description = e?.error?.description || e?.message || 'Razorpay request failed';
  if (e?.statusCode === 401) {
    throw ApiError.badRequest(
      'Razorpay authentication failed. Check RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET and restart the backend.',
    );
  }
  throw ApiError.badRequest(description);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll Razorpay until payment is terminal or timeout. */
export async function waitForRazorpayPayment(
  paymentId: string,
  timeoutMs = 90_000,
): Promise<{ id: string; status: RazorpayPaymentStatus; order_id: string }> {
  const rzp = await getRazorpayClient();
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    const row = await rzp.payments.fetch(paymentId);
    if (row.status === 'captured' || row.status === 'failed' || row.status === 'refunded') {
      return row;
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(2000);
  }
  throw ApiError.badRequest(
    'UPI payment is still pending. Open your UPI app, approve the collect request, then try again.',
  );
}
