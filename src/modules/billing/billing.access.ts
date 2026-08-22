import { GYM_STATUS, ROLES, type GymFeature, type GymPlanId, type Role } from '../../config/constants';
import type { GymDocument } from '../gyms/gym.model';
import { PLATFORM_PLANS, TRIAL_FEATURES } from './billing.plans';

export type GymAccessReason = 'ok' | 'trial' | 'trial_expired' | 'plan_expired' | 'suspended';

export interface GymAccessState {
  allowed: boolean;
  reason: GymAccessReason;
  plan: GymPlanId | null;
  features: GymFeature[];
  memberLimit: number | null;
  trialEndsAt: string | null;
  planPeriodEnd: string | null;
  daysRemaining: number | null;
  message: string;
}

function daysLeft(date?: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function iso(date?: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/**
 * Source of truth for whether a gym (and therefore its owner / staff / members)
 * may use the product. Grandfathered gyms that are `active` with no period
 * (seed / SA-activated) stay open.
 */
export function computeGymAccess(gym: GymDocument): GymAccessState {
  const now = Date.now();
  const plan = (gym.plan as GymPlanId | null | undefined) ?? null;
  const catalog = plan ? PLATFORM_PLANS[plan] : undefined;
  const trialEnds = gym.trialEndsAt ?? null;
  const periodEnd = gym.planPeriodEnd ?? null;

  const trialLive = gym.status === GYM_STATUS.TRIAL && !!trialEnds && trialEnds.getTime() > now;
  const paidLive = !!periodEnd && periodEnd.getTime() > now;
  const grandfathered = gym.status === GYM_STATUS.ACTIVE && !periodEnd && !plan;

  if (trialLive) {
    return {
      allowed: true,
      reason: 'trial',
      plan: null,
      features: [...TRIAL_FEATURES],
      memberLimit: null,
      trialEndsAt: iso(trialEnds),
      planPeriodEnd: iso(periodEnd),
      daysRemaining: daysLeft(trialEnds),
      message: `${daysLeft(trialEnds)} day(s) left on your free trial`,
    };
  }

  if (paidLive || grandfathered) {
    return {
      allowed: true,
      reason: 'ok',
      plan: grandfathered ? 'pro' : plan,
      features: grandfathered ? [...TRIAL_FEATURES] : [...(catalog?.features ?? TRIAL_FEATURES)],
      memberLimit: grandfathered ? null : (catalog?.memberLimit ?? null),
      trialEndsAt: iso(trialEnds),
      planPeriodEnd: iso(periodEnd),
      daysRemaining: daysLeft(periodEnd),
      message: catalog ? `${catalog.name} plan is active` : 'Gym is active',
    };
  }

  const trialExpired = !!trialEnds && trialEnds.getTime() <= now && !paidLive;
  const planExpired = !!periodEnd && periodEnd.getTime() <= now;

  if (trialExpired && !plan) {
    return {
      allowed: false,
      reason: 'trial_expired',
      plan: null,
      features: [],
      memberLimit: 0,
      trialEndsAt: iso(trialEnds),
      planPeriodEnd: iso(periodEnd),
      daysRemaining: 0,
      message: 'Your 14-day free trial has ended. Choose a plan to continue.',
    };
  }

  if (planExpired || gym.status === GYM_STATUS.SUSPENDED) {
    return {
      allowed: false,
      reason: planExpired ? 'plan_expired' : 'suspended',
      plan,
      features: [],
      memberLimit: 0,
      trialEndsAt: iso(trialEnds),
      planPeriodEnd: iso(periodEnd),
      daysRemaining: 0,
      message: planExpired
        ? 'Your Fitzenix plan has expired. Renew to restore access.'
        : 'This gym is suspended. Contact the gym owner.',
    };
  }

  return {
    allowed: false,
    reason: 'trial_expired',
    plan,
    features: [],
    memberLimit: 0,
    trialEndsAt: iso(trialEnds),
    planPeriodEnd: iso(periodEnd),
    daysRemaining: 0,
    message: 'Your 14-day free trial has ended. Choose a plan to continue.',
  };
}

export function hasGymFeature(access: GymAccessState, feature: GymFeature): boolean {
  return access.allowed && access.features.includes(feature);
}

export function lockedMessageForRole(role: Role, access: GymAccessState): string {
  if (role === ROLES.GYM_OWNER) return access.message;
  return 'The gym plan has expired. Please contact your gym owner to restore access.';
}
