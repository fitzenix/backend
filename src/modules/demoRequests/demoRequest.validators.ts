import { z } from 'zod';

export const createDemoRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number'),
  email: z.string().trim().email().max(254),
  city: z.string().trim().min(2).max(100),
  gymName: z.string().trim().min(2).max(160),
});

export type CreateDemoRequestInput = z.infer<typeof createDemoRequestSchema>;