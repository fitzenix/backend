import { env } from '../../config/env';
import { RazorpayGateway } from './RazorpayGateway';
import { MockGateway } from './MockGateway';
import type { PaymentGateway } from './PaymentGateway';

let instance: PaymentGateway | null = null;

/** Factory: returns the configured payment gateway singleton. */
export function getPaymentGateway(): PaymentGateway {
  if (instance) return instance;
  instance = env.payments.gateway === 'razorpay' ? new RazorpayGateway() : new MockGateway();
  return instance;
}

export type { PaymentGateway } from './PaymentGateway';
export { RazorpayGateway } from './RazorpayGateway';
export { MockGateway } from './MockGateway';
