import { z } from 'zod';
import { ROLES } from '../../config/constants';
import { objectId, paginationQuery } from '../../validators/common';

export { objectId } from '../../validators/common';

export const listUsersQuery = paginationQuery.extend({
  role: z.enum([ROLES.GYM_OWNER, ROLES.TRAINER, ROLES.STAFF, ROLES.MEMBER]).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
  gymId: objectId.optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  phone: z.string().min(6).max(20).optional(),
  role: z.enum([ROLES.TRAINER, ROLES.STAFF, ROLES.MEMBER]),
  gymId: objectId.optional(), // required for super_admin, ignored for gym_owner
  trainerProfile: z
    .object({
      specialties: z.array(z.string()).optional(),
      bio: z.string().max(1000).optional(),
      experienceYears: z.number().min(0).optional(),
      certifications: z.array(z.string()).optional(),
      hourlyRatePaise: z.number().int().min(0).optional(),
    })
    .optional(),
  staffProfile: z
    .object({
      jobTitle: z.string().trim().min(2).max(80).optional(),
      department: z.string().trim().max(80).optional(),
    })
    .optional(),
  memberProfile: z
    .object({
      allowTwoSessions: z.boolean().optional(),
    })
    .optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().min(6).max(20).optional(),
    status: z.enum(['active', 'inactive', 'suspended', 'pending']).optional(),
    trainerProfile: z
      .object({
        specialties: z.array(z.string()).optional(),
        bio: z.string().max(1000).optional(),
        experienceYears: z.number().min(0).optional(),
        certifications: z.array(z.string()).optional(),
        hourlyRatePaise: z.number().int().min(0).optional(),
      })
      .optional(),
    staffProfile: z
      .object({
        jobTitle: z.string().trim().min(2).max(80).optional(),
        department: z.string().trim().max(80).optional(),
      })
      .optional(),
    memberProfile: z
      .object({
        allowTwoSessions: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().min(6).max(20).optional(),
    memberProfile: z
      .object({
        dateOfBirth: z.coerce.date().optional(),
        gender: z.enum(['male', 'female', 'other', 'unspecified']).optional(),
        heightCm: z.number().min(0).optional(),
        weightKg: z.number().min(0).optional(),
        goals: z.array(z.string()).optional(),
        measurements: z
          .object({
            chest: z.number().min(0).optional(),
            waist: z.number().min(0).optional(),
            hips: z.number().min(0).optional(),
            arms: z.number().min(0).optional(),
            thighs: z.number().min(0).optional(),
          })
          .optional(),
        preferences: z
          .object({
            pushNotifications: z.boolean().optional(),
            emailUpdates: z.boolean().optional(),
          })
          .optional(),
        emergencyContact: z.object({ name: z.string().optional(), phone: z.string().optional() }).optional(),
      })
      .optional(),
    trainerProfile: z
      .object({
        specialties: z.array(z.string()).optional(),
        bio: z.string().max(1000).optional(),
        experienceYears: z.number().min(0).optional(),
        certifications: z.array(z.string()).optional(),
        hourlyRatePaise: z.number().int().min(0).optional(),
      })
      .optional(),
    staffProfile: z
      .object({
        jobTitle: z.string().trim().min(2).max(80).optional(),
        department: z.string().trim().max(80).optional(),
      })
      .optional(),
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const initiateTransferSchema = z
  .object({
    userId: objectId.optional(),
    email: z.string().email().toLowerCase().optional(),
    phone: z.string().min(6).max(20).optional(),
  })
  .refine((d) => d.userId || d.email || d.phone, { message: 'userId, email, or phone is required' });

export type InitiateTransferInput = z.infer<typeof initiateTransferSchema>;
