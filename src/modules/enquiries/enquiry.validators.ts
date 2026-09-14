import { z } from 'zod';
import { objectId, paginationQuery } from '../../validators/common';

export const enquiryStatusEnum = z.enum(['new', 'contacted', 'converted', 'lost']);

export const enquiryListQuery = paginationQuery.extend({
  status: enquiryStatusEnum.optional(),
});

export const createEnquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20).optional(),
  email: z.string().trim().email().optional(),
  note: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(80).optional(),
  interestedPlan: z.string().trim().max(120).optional(),
  status: enquiryStatusEnum.optional(),
});

export const updateEnquirySchema = createEnquirySchema.partial().extend({
  status: enquiryStatusEnum.optional(),
  convertedMemberId: objectId.optional(),
});

export type EnquiryListQuery = z.infer<typeof enquiryListQuery>;
export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;
export type UpdateEnquiryInput = z.infer<typeof updateEnquirySchema>;
