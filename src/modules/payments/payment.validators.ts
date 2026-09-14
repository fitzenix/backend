import { z } from 'zod';
import { objectId, paginationQuery } from '../../validators/common';

export const listQuery = paginationQuery.extend({
  memberId: objectId.optional(),
  status: z.enum(['created', 'paid', 'failed', 'refunded']).optional(),
});

export const checkoutSchema = z.object({
  planId: objectId,
  memberId: objectId.optional(),
});

export const verifySchema = z.object({
  orderId: z.string().min(3),
  paymentId: z.string().min(3),
  signature: z.string().min(3),
});

export type ListQuery = z.infer<typeof listQuery>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type VerifyInput = z.infer<typeof verifySchema>;
