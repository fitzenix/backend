import { z } from 'zod';
import { objectId, paginationQuery } from '../../validators/common';

export const listQuery = paginationQuery.extend({
  status: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  memberId: objectId.optional(),
});

export const createPlanSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  durationDays: z.number().int().min(1),
  pricePaise: z.number().int().min(0),
  features: z.array(z.string()).optional(),
  trainerIncluded: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updatePlanSchema = createPlanSchema.partial().strict();

export const createSubscriptionSchema = z.object({
  memberId: objectId,
  planId: objectId,
  startDate: z.coerce.date().optional(),
  autoRenew: z.boolean().optional(),
  markPaid: z.boolean().optional(),
});

export type ListQuery = z.infer<typeof listQuery>;
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
