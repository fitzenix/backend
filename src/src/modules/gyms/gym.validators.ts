import { z } from 'zod';
import { paginationQuery } from '../../validators/common';

export const listGymsQuery = paginationQuery.extend({
  status: z.enum(['active', 'suspended', 'trial']).optional(),
});

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    country: z.string().optional(),
  })
  .optional();

export const updateGymSchema = z
  .object({
    name: z.string().min(2).max(160).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).optional(),
    address: addressSchema,
    geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
  })
  .strict();

const hexColor = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

export const brandingSchema = z
  .object({
    primaryColor: hexColor.optional(),
    secondaryColor: hexColor.optional(),
    tagline: z.string().max(200).optional(),
  })
  .strict();

export const settingsSchema = z
  .object({
    timezone: z.string().optional(),
    allowMemberSelfCheckin: z.boolean().optional(),
    membershipExpiryReminderDays: z.number().int().min(0).max(60).optional(),
    workingHours: z
      .object({ open: z.string().regex(/^\d{2}:\d{2}$/), close: z.string().regex(/^\d{2}:\d{2}$/) })
      .optional(),
    capacity: z.number().int().min(1).max(100000).optional(),
  })
  .strict();

export const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'trial']) });

export const createGymSchema = z
  .object({
    name: z.string().min(2).max(160),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(20).optional(),
    address: addressSchema,
    ownerId: z.string().min(1).optional(),
    owner: z
      .object({
        name: z.string().min(2).max(120),
        email: z.string().email(),
        phone: z.string().min(6).max(20).optional(),
        password: z.string().min(8).max(128),
      })
      .optional(),
  })
  .strict()
  .refine((d) => !!d.ownerId || !!d.owner, { message: 'ownerId or owner is required' });

export type ListGymsQuery = z.infer<typeof listGymsQuery>;
export type UpdateGymInput = z.infer<typeof updateGymSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
export type CreateGymInput = z.infer<typeof createGymSchema>;
