import { User } from '../users/user.model';
import { Gym } from '../gyms/gym.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES } from '../../config/constants';
import { computeGymAccess, type GymAccessState } from './billing.access';
import { getPlatformPlan } from './billing.plans';

export interface MemberQuota {
  used: number;
  limit: number | null;
  remaining: number | null;
  planName: string;
  atLimit: boolean;
}

function planNameFor(access: GymAccessState): string {
  if (access.reason === 'trial') return 'Free trial';
  const catalog = access.plan ? getPlatformPlan(access.plan) : undefined;
  return catalog?.name ?? 'your plan';
}

export function nextPlanHint(limit: number | null): string {
  if (limit === 100) return ' Upgrade to Growth (500 members) or Pro (unlimited).';
  if (limit === 500) return ' Upgrade to Pro for unlimited members.';
  return '';
}

export async function countGymMembers(gymId: string): Promise<number> {
  return User.countDocuments({ gym: gymId, role: ROLES.MEMBER, deletedAt: null });
}

export function quotaFrom(access: GymAccessState, used: number): MemberQuota {
  const limit = access.allowed ? access.memberLimit : 0;
  const remaining = limit == null ? null : Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    planName: planNameFor(access),
    atLimit: remaining !== null && remaining <= 0,
  };
}

export async function getMemberQuota(gymId: string, access?: GymAccessState): Promise<MemberQuota> {
  const gym = await Gym.findById(gymId);
  if (!gym) throw ApiError.notFound('Gym not found');
  const state = access ?? computeGymAccess(gym);
  const used = await countGymMembers(gymId);
  return quotaFrom(state, used);
}

export function memberLimitReachedMessage(quota: MemberQuota): string {
  if (quota.limit == null) return 'Member limit reached. Upgrade to add more members.';
  return `${quota.planName} allows ${quota.limit} members. You already have ${quota.used}.${nextPlanHint(quota.limit)}`;
}

export async function assertCanAddMembers(gymId: string, addCount = 1, access?: GymAccessState): Promise<MemberQuota> {
  const quota = await getMemberQuota(gymId, access);
  if (addCount <= 0) return quota;
  if (quota.remaining === null) return quota;
  if (quota.remaining < addCount) {
    throw ApiError.forbidden(memberLimitReachedMessage(quota));
  }
  return quota;
}
