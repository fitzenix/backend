import { z } from 'zod';

const role = z.enum(['gym_owner', 'trainer_staff', 'member']);

export const createDeletionRequestSchema = z
  .object({
    identity: z.string().trim().min(1).max(254),
    role,
    gymName: z.string().trim().max(160).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'gym_owner' && !value.gymName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['gymName'],
        message: 'Gym name is required for gym-owner requests',
      });
    }

    if (value.identity.includes('@')) {
      if (!z.string().email().safeParse(value.identity).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['identity'],
          message: 'Enter a valid email address or registered phone number',
        });
      }
    } else if (value.identity.replace(/\D/g, '').length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identity'],
        message: 'Enter a valid email address or registered phone number',
      });
    }
  });

export const verifyDeletionRequestSchema = z.object({
  requestId: z.string().regex(/^[a-f\d]{24}$/i),
  code: z.string().regex(/^\d{6}$/),
});

export const deletionStatusSchema = z.object({
  requestId: z.string().regex(/^[a-f\d]{24}$/i),
  trackingToken: z.string().min(32).max(128),
});

export const listDeletionRequestsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const resolveOwnerDeletionSchema = z.discriminatedUnion('resolution', [
  z.object({
    resolution: z.literal('transferred'),
    newOwnerId: z.string().regex(/^[a-f\d]{24}$/i),
  }),
  z.object({ resolution: z.literal('closed') }),
]);

export type CreateDeletionRequestInput = z.infer<typeof createDeletionRequestSchema>;
export type VerifyDeletionRequestInput = z.infer<typeof verifyDeletionRequestSchema>;
export type DeletionStatusInput = z.infer<typeof deletionStatusSchema>;
export type ResolveOwnerDeletionInput = z.infer<typeof resolveOwnerDeletionSchema>;
