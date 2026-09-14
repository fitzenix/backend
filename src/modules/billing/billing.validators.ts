import { z } from 'zod';

export const billingCheckoutSchema = z.object({
  plan: z.enum(['starter', 'growth', 'pro']),
});

export const billingVerifySchema = z.object({
  orderId: z.string().min(4),
  paymentId: z.string().min(4),
  signature: z.string().min(8),
});

export const billingUpiCollectSchema = z.object({
  plan: z.enum(['starter', 'growth', 'pro']),
  vpa: z
    .string()
    .trim()
    .min(3)
    .max(256)
    .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, 'Enter a valid UPI ID (e.g. name@bank)'),
});

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;
export type BillingVerifyInput = z.infer<typeof billingVerifySchema>;
export type BillingUpiCollectInput = z.infer<typeof billingUpiCollectSchema>;
