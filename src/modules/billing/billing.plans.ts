import {
  GYM_FEATURES,
  GYM_PLANS,
  PLAN_PERIOD_DAYS,
  TRIAL_DAYS,
  type GymFeature,
  type GymPlanId,
} from '../../config/constants';

export interface PlatformPlan {
  id: GymPlanId;
  name: string;
  tagline: string;
  pricePaise: number;
  periodDays: number;
  memberLimit: number | null;
  popular: boolean;
  features: GymFeature[];
  featureLabels: string[];
}

const STARTER_FEATURES: GymFeature[] = [
  GYM_FEATURES.MEMBERS,
  GYM_FEATURES.CHECKIN,
  GYM_FEATURES.ATTENDANCE,
  GYM_FEATURES.PAYMENTS,
];

const GROWTH_FEATURES: GymFeature[] = [
  ...STARTER_FEATURES,
  GYM_FEATURES.APPS,
  GYM_FEATURES.REPORTS,
  GYM_FEATURES.CRM,
];

const PRO_FEATURES: GymFeature[] = [
  ...GROWTH_FEATURES,
  GYM_FEATURES.MULTI_STAFF,
  GYM_FEATURES.ANALYTICS,
  GYM_FEATURES.PRIORITY_SUPPORT,
];

/** Catalog shown on the owner paywall. Amounts are INR paise. */
export const PLATFORM_PLANS: Record<GymPlanId, PlatformPlan> = {
  [GYM_PLANS.STARTER]: {
    id: GYM_PLANS.STARTER,
    name: 'Starter',
    tagline: 'Essentials for a new gym',
    pricePaise: 49_900,
    periodDays: PLAN_PERIOD_DAYS,
    memberLimit: 100,
    popular: false,
    features: STARTER_FEATURES,
    featureLabels: ['Up to 100 Members', 'QR Check-In', 'Attendance', 'Payments'],
  },
  [GYM_PLANS.GROWTH]: {
    id: GYM_PLANS.GROWTH,
    name: 'Growth',
    tagline: 'Run the full Fitzenix suite',
    pricePaise: 99_900,
    periodDays: PLAN_PERIOD_DAYS,
    memberLimit: 500,
    popular: true,
    features: GROWTH_FEATURES,
    featureLabels: [
      'Up to 500 Members',
      'Owner App',
      'Trainer App',
      'Member App',
      'Reports',
      'CRM',
    ],
  },
  [GYM_PLANS.PRO]: {
    id: GYM_PLANS.PRO,
    name: 'Pro',
    tagline: 'Unlimited scale and priority care',
    pricePaise: 199_900,
    periodDays: PLAN_PERIOD_DAYS,
    memberLimit: null,
    popular: false,
    features: PRO_FEATURES,
    featureLabels: ['Unlimited Members', 'Multi Staff', 'Advanced Analytics', 'Priority Support'],
  },
};

export const PLATFORM_PLAN_LIST: PlatformPlan[] = [
  PLATFORM_PLANS.starter,
  PLATFORM_PLANS.growth,
  PLATFORM_PLANS.pro,
];

/** Trial unlocks every Pro feature so owners can evaluate the product. */
export const TRIAL_FEATURES: GymFeature[] = PRO_FEATURES;

export function getPlatformPlan(id: string): PlatformPlan | undefined {
  return PLATFORM_PLANS[id as GymPlanId];
}

export { TRIAL_DAYS, PLAN_PERIOD_DAYS };
