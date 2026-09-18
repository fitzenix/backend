import { z } from 'zod';

const paidPlan = z.enum(['starter', 'growth', 'pro']);

/** Accept `{ plan }` (canonical) or `{ planId }` from older clients. */
export const billingCheckoutSchema = z
  .object({
    plan: paidPlan.optional(),
    planId: paidPlan.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.plan && !value.planId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['plan'],
        message: 'plan is required (starter | growth | pro)',
      });
    }
  })
  .transform(({ plan, planId }) => ({
    plan: (plan ?? planId) as 'starter' | 'growth' | 'pro',
  }));

export const billingVerifySchema = z.object({
  orderId: z.string().min(4),
  paymentId: z.string().min(4),
  signature: z.string().min(8),
});

export const billingUpiCollectSchema = z.object({
  plan: paidPlan,
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
