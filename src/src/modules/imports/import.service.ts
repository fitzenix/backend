import { Types } from 'mongoose';
import { User } from '../users/user.model';
import { MembershipPlan } from '../memberships/membershipPlan.model';
import { Subscription } from '../memberships/subscription.model';
import { Payment } from '../payments/payment.model';
import { Invoice } from '../payments/invoice.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, USER_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS, INVOICE_STATUS, CURRENCY } from '../../config/constants';
import { numericId } from '../../utils/ids';
import type { Ctx } from '../../types/index';
import { IMPORT_DEFAULT_PASSWORD } from './import.constants';
import { parseImportFile, type ParseIssue } from './import.parser';

export interface ImportBucket {
  created: number;
  reused: number;
  skipped: number;
}

export interface ImportResult {
  plans: ImportBucket;
  trainers: ImportBucket;
  members: ImportBucket;
  subscriptions: { created: number; skipped: number };
  assignments: { created: number; skipped: number };
  defaultPassword: string;
  errors: ParseIssue[];
}

function emptyBucket(): ImportBucket {
  return { created: 0, reused: 0, skipped: 0 };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

function resolvePassword(raw?: string): { ok: true; password: string } | { ok: false; message: string } {
  const password = raw?.trim() || IMPORT_DEFAULT_PASSWORD;
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters' };
  return { ok: true, password };
}

function sanitizePhone(phone?: string): string | undefined {
  const value = phone?.trim();
  if (!value) return undefined;
  if (value.length < 6 || value.length > 20) return undefined;
  return value;
}

async function recordPaidSubscription(opts: {
  gym: string;
  memberId: string;
  plan: { _id: unknown; name: string; durationDays: number; pricePaise: number; features?: string[] };
  start: Date;
  importerId: string;
}): Promise<void> {
  const end = addDays(opts.start, opts.plan.durationDays);
  const sub = await Subscription.create({
    gym: opts.gym,
    member: opts.memberId,
    plan: opts.plan._id,
    planSnapshot: {
      name: opts.plan.name,
      durationDays: opts.plan.durationDays,
      pricePaise: opts.plan.pricePaise,
      features: opts.plan.features ?? [],
    },
    startDate: opts.start,
    endDate: end,
    autoRenew: false,
    status: SUBSCRIPTION_STATUS.ACTIVE,
  });

  const payment = await Payment.create({
    gym: opts.gym,
    member: opts.memberId,
    subscription: sub._id,
    provider: 'manual',
    amountPaise: opts.plan.pricePaise,
    currency: CURRENCY,
    status: PAYMENT_STATUS.PAID,
    purpose: 'subscription',
    paidAt: new Date(),
    notes: { markedPaidBy: opts.importerId, manual: true, import: true },
  });
  sub.payment = payment._id;
  await sub.save();

  await Invoice.create({
    gym: opts.gym,
    member: opts.memberId,
    payment: payment._id,
    number: `INV-${new Date().getFullYear()}-${numericId(8)}`,
    items: [
      {
        description: `Membership: ${opts.plan.name}`,
        quantity: 1,
        unitPricePaise: opts.plan.pricePaise,
        amountPaise: opts.plan.pricePaise,
      },
    ],
    subtotalPaise: opts.plan.pricePaise,
    taxPaise: 0,
    totalPaise: opts.plan.pricePaise,
    currency: CURRENCY,
    status: INVOICE_STATUS.PAID,
    paidAt: new Date(),
    note: 'Imported membership',
  });
}

export const importService = {
  async importMembers(ctx: Ctx, file?: Express.Multer.File): Promise<ImportResult> {
    const gym = requireTenant(ctx);
    if (!file?.buffer?.length) {
      throw ApiError.badRequest('Upload a .xlsx or .csv file in the "file" field.');
    }

    const parsed = parseImportFile(file.buffer, file.originalname || 'import.xlsx');
    if (!parsed.plans.length && !parsed.trainers.length && !parsed.members.length) {
      throw ApiError.badRequest('No plans, trainers or members found in this file.');
    }

    const result: ImportResult = {
      plans: emptyBucket(),
      trainers: emptyBucket(),
      members: emptyBucket(),
      subscriptions: { created: 0, skipped: 0 },
      assignments: { created: 0, skipped: 0 },
      defaultPassword: IMPORT_DEFAULT_PASSWORD,
      errors: [...parsed.errors],
    };

    const planByName = new Map<string, { _id: unknown; name: string; durationDays: number; pricePaise: number; features?: string[] }>();
    const existingPlans = await MembershipPlan.find({ gym, deletedAt: null }).select('name durationDays pricePaise features');
    for (const plan of existingPlans) {
      planByName.set(plan.name.trim().toLowerCase(), plan);
    }

    for (const row of parsed.plans) {
      const key = row.name.trim().toLowerCase();
      const existing = planByName.get(key);
      if (existing) {
        result.plans.reused += 1;
        continue;
      }
      try {
        const created = await MembershipPlan.create({
          gym,
          name: row.name.trim(),
          description: row.description ?? '',
          durationDays: row.durationDays,
          pricePaise: row.pricePaise,
          features: row.features,
          trainerIncluded: row.trainerIncluded,
          isActive: true,
        });
        planByName.set(key, created);
        result.plans.created += 1;
      } catch (err) {
        result.plans.skipped += 1;
        result.errors.push({
          sheet: 'Plans',
          row: row.row,
          message: err instanceof Error ? err.message : 'Could not create plan',
        });
      }
    }

    const trainerByEmail = new Map<string, string>();
    const existingTrainers = await User.find({ gym, role: ROLES.TRAINER, deletedAt: null }).select('email');
    for (const trainer of existingTrainers) {
      trainerByEmail.set(trainer.email.toLowerCase(), String(trainer._id));
    }

    for (const row of parsed.trainers) {
      const email = row.email.toLowerCase();
      const already = trainerByEmail.get(email);
      if (already) {
        result.trainers.reused += 1;
        continue;
      }
      const dup = await User.findOne({ email });
      if (dup) {
        result.trainers.skipped += 1;
        result.errors.push({
          sheet: 'Trainers',
          row: row.row,
          message: `Email ${email} is already used in Fitzenix — skipped`,
        });
        continue;
      }
      const secret = resolvePassword(row.password);
      if (!secret.ok) {
        result.trainers.skipped += 1;
        result.errors.push({ sheet: 'Trainers', row: row.row, message: secret.message });
        continue;
      }
      try {
        const user = new User({
          name: row.name.trim(),
          email,
          phone: sanitizePhone(row.phone),
          role: ROLES.TRAINER,
          gym,
          status: USER_STATUS.ACTIVE,
          passwordHash: 'pending',
          trainerProfile: { specialties: row.specialties, certifications: [] },
        });
        await user.setPassword(secret.password);
        await user.save();
        trainerByEmail.set(email, String(user._id));
        result.trainers.created += 1;
      } catch (err) {
        result.trainers.skipped += 1;
        result.errors.push({
          sheet: 'Trainers',
          row: row.row,
          message: err instanceof Error ? err.message : 'Could not create trainer',
        });
      }
    }

    const seenMemberEmails = new Set<string>();
    for (const row of parsed.members) {
      const email = row.email.toLowerCase();
      if (seenMemberEmails.has(email)) {
        result.members.skipped += 1;
        result.errors.push({ sheet: 'Members', row: row.row, message: `Duplicate email in file: ${email}` });
        continue;
      }
      seenMemberEmails.add(email);

      const dup = await User.findOne({ email });
      if (dup) {
        result.members.skipped += 1;
        result.errors.push({
          sheet: 'Members',
          row: row.row,
          message: `Email ${email} already exists — skipped (existing member was not changed)`,
        });
        continue;
      }

      const secret = resolvePassword(row.password);
      if (!secret.ok) {
        result.members.skipped += 1;
        result.errors.push({ sheet: 'Members', row: row.row, message: secret.message });
        continue;
      }

      try {
        const user = new User({
          name: row.name.trim(),
          email,
          phone: sanitizePhone(row.phone),
          role: ROLES.MEMBER,
          gym,
          status: USER_STATUS.ACTIVE,
          passwordHash: 'pending',
          memberProfile: { allowTwoSessions: row.allowTwoSessions, gender: 'unspecified', goals: [] },
        });
        await user.setPassword(secret.password);
        await user.save();
        result.members.created += 1;

        if (row.planName) {
          const plan = planByName.get(row.planName.trim().toLowerCase());
          if (!plan) {
            result.subscriptions.skipped += 1;
            result.errors.push({
              sheet: 'Members',
              row: row.row,
              message: `Member created, but plan "${row.planName}" was not found`,
            });
          } else {
            const start = row.startDate ?? new Date();
            if (row.markPaid) {
              await recordPaidSubscription({
                gym,
                memberId: String(user._id),
                plan,
                start,
                importerId: String(ctx.user._id),
              });
            } else {
              await Subscription.create({
                gym,
                member: user._id,
                plan: plan._id,
                planSnapshot: {
                  name: plan.name,
                  durationDays: plan.durationDays,
                  pricePaise: plan.pricePaise,
                  features: plan.features ?? [],
                },
                startDate: start,
                endDate: addDays(start, plan.durationDays),
                autoRenew: false,
                status: SUBSCRIPTION_STATUS.PENDING,
              });
            }
            result.subscriptions.created += 1;
          }
        }

        if (row.trainerEmail) {
          const trainerId = trainerByEmail.get(row.trainerEmail);
          if (!trainerId) {
            result.assignments.skipped += 1;
            result.errors.push({
              sheet: 'Members',
              row: row.row,
              message: `Member created, but trainer ${row.trainerEmail} was not found`,
            });
          } else {
            user.memberProfile = {
              ...(user.memberProfile ?? { gender: 'unspecified', goals: [] }),
              assignedTrainer: new Types.ObjectId(trainerId),
            } as typeof user.memberProfile;
            await user.save();
            result.assignments.created += 1;
          }
        }
      } catch (err) {
        result.members.skipped += 1;
        result.errors.push({
          sheet: 'Members',
          row: row.row,
          message: err instanceof Error ? err.message : 'Could not create member',
        });
      }
    }

    return result;
  },
};

export default importService;
