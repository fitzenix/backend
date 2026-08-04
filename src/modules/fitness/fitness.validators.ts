import { z } from 'zod';
import { objectId, paginationQuery } from '../../validators/common';

export const listQuery = paginationQuery.extend({
  memberId: objectId.optional(),
  isActive: z.coerce.boolean().optional(),
});

const exercise = z.object({
  name: z.string().min(1),
  sets: z.number().int().min(0).optional(),
  reps: z.string().optional(),
  restSeconds: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const day = z.object({
  day: z.string().min(1),
  focus: z.string().optional(),
  exercises: z.array(exercise).default([]),
});

export const createWorkoutSchema = z.object({
  memberId: objectId,
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional(),
  days: z.array(day).default([]),
});

export const updateWorkoutSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    description: z.string().max(2000).optional(),
    days: z.array(day).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const mealItem = z.object({
  food: z.string().min(1),
  quantity: z.string().optional(),
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  carbs: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
});

const meal = z.object({
  name: z.string().min(1),
  time: z.string().optional(),
  items: z.array(mealItem).default([]),
});

export const createDietSchema = z.object({
  memberId: objectId,
  title: z.string().min(2).max(160),
  targetCalories: z.number().min(0).optional(),
  meals: z.array(meal).default([]),
  notes: z.string().max(2000).optional(),
});

export const updateDietSchema = z
  .object({
    title: z.string().min(2).max(160).optional(),
    targetCalories: z.number().min(0).optional(),
    meals: z.array(meal).optional(),
    notes: z.string().max(2000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const progressSeriesQuery = z.object({
  range: z.enum(['week', 'month', 'year']).default('week'),
  memberId: objectId.optional(),
});

export type ProgressSeriesQuery = z.infer<typeof progressSeriesQuery>;

export const createProgressSchema = z.object({
  memberId: objectId.optional(),
  date: z.coerce.date().optional(),
  weightKg: z.number().min(0).optional(),
  bodyFatPct: z.number().min(0).max(100).optional(),
  measurements: z
    .object({
      chest: z.number().optional(),
      waist: z.number().optional(),
      hips: z.number().optional(),
      arms: z.number().optional(),
      thighs: z.number().optional(),
    })
    .optional(),
  notes: z.string().max(1000).optional(),
});

export type ListQuery = z.infer<typeof listQuery>;
export type CreateWorkoutInput = z.infer<typeof createWorkoutSchema>;
export type UpdateWorkoutInput = z.infer<typeof updateWorkoutSchema>;
export type CreateDietInput = z.infer<typeof createDietSchema>;
export type UpdateDietInput = z.infer<typeof updateDietSchema>;
export type CreateProgressInput = z.infer<typeof createProgressSchema>;
