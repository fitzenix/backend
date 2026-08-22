import { User, type UserDocument } from './user.model';
import { Gym } from '../gyms/gym.model';
import { GymTransfer, TRANSFER_STATUS, type GymTransferDocument } from './gymTransfer.model';
import { GymTenure, TENURE_END_REASON } from './gymTenure.model';
import { Subscription } from '../memberships/subscription.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, SUBSCRIPTION_STATUS, USER_STATUS } from '../../config/constants';
import { env } from '../../config/env';
import { generateOtp, hashToken } from '../../utils/tokens';
import { mailService } from '../../services/mail/mail.service';
import { gymTransferCompleteEmail, gymTransferRequestEmail } from '../../services/mail/templates';
import { RefreshToken } from '../auth/refreshToken.model';
import type { Ctx } from '../../types/index';

const TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function digitsOf(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '');
}

export type ExistingAccountMatch = {
  user: UserDocument;
  matchedBy: 'email' | 'phone';
};

export async function findExistingAccount(email?: string, phone?: string): Promise<ExistingAccountMatch | null> {
  if (email) {
    const byEmail = await User.findOne({ email: email.toLowerCase(), deletedAt: null });
    if (byEmail) return { user: byEmail, matchedBy: 'email' };
  }
  const digits = digitsOf(phone);
  if (digits.length >= 10) {
    const tail = digits.slice(-10);
    const byPhone = await User.findOne({
      deletedAt: null,
      phone: { $exists: true, $ne: '' },
    }).then(async () => {
      const candidates = await User.find({ deletedAt: null, phone: { $regex: tail } });
      return candidates.find((u) => digitsOf(u.phone).endsWith(tail)) ?? null;
    });
    if (byPhone) return { user: byPhone, matchedBy: 'phone' };
  }
  return null;
}

export async function transferConflictDetails(user: UserDocument, matchedBy: 'email' | 'phone') {
  const gym = user.gym ? await Gym.findById(user.gym).select('name') : null;
  return {
    userId: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    matchedBy,
    currentGym: gym ? { id: String(gym._id), name: gym.name } : null,
  };
}

export async function openTenure(memberId: unknown, gymId: unknown): Promise<void> {
  const open = await GymTenure.findOne({ member: memberId, gym: gymId, endedAt: null });
  if (open) return;
  await GymTenure.create({
    member: memberId,
    gym: gymId,
    startedAt: new Date(),
    endedAt: null,
    endReason: TENURE_END_REASON.ACTIVE,
  });
}

async function closeTenure(memberId: unknown, gymId: unknown, reason: typeof TENURE_END_REASON.TRANSFERRED): Promise<void> {
  await GymTenure.updateMany(
    { member: memberId, gym: gymId, endedAt: null },
    { $set: { endedAt: new Date(), endReason: reason } },
  );
}

export const transferService = {
  async initiate(
    ctx: Ctx,
    input: { userId?: string; email?: string; phone?: string },
  ): Promise<GymTransferDocument> {
    const toGymId = ctx.user.gym ? String(ctx.user.gym) : null;
    if (!toGymId) throw ApiError.badRequest('You are not linked to a gym');

    const match = input.userId
      ? { user: await User.findOne({ _id: input.userId, deletedAt: null }), matchedBy: 'email' as const }
      : await findExistingAccount(input.email, input.phone);

    if (!match?.user) throw ApiError.notFound('No Fitzenix account found for this email or mobile');
    const member = match.user;

    if (member.role !== ROLES.MEMBER) {
      throw ApiError.conflict('This Fitzenix account is not a member profile and cannot be transferred');
    }
    if (String(member.gym) === toGymId) {
      throw ApiError.conflict('This member already belongs to your gym');
    }
    if (!member.gym) throw ApiError.badRequest('Member is not linked to a gym');

    await GymTransfer.updateMany(
      { member: member._id, toGym: toGymId, status: TRANSFER_STATUS.PENDING },
      { $set: { status: TRANSFER_STATUS.CANCELLED } },
    );

    const otp = generateOtp();
    const transfer = await GymTransfer.create({
      member: member._id,
      fromGym: member.gym,
      toGym: toGymId,
      requestedBy: ctx.user._id,
      status: TRANSFER_STATUS.PENDING,
      otpHash: hashToken(otp),
      otpExpires: new Date(Date.now() + env.otpTtlSeconds * 1000),
      expiresAt: new Date(Date.now() + TRANSFER_TTL_MS),
    });

    const [fromGym, toGym] = await Promise.all([
      Gym.findById(member.gym).select('name'),
      Gym.findById(toGymId).select('name'),
    ]);

    member.otpHash = hashToken(otp);
    member.otpExpires = new Date(Date.now() + env.otpTtlSeconds * 1000);
    member.otpPurpose = 'gym_transfer';
    await member.save();

    await mailService.send(
      member.email,
      gymTransferRequestEmail({
        name: member.name,
        fromGym: fromGym?.name ?? 'your current gym',
        toGym: toGym?.name ?? 'the new gym',
        code: otp,
        minutes: Math.round(env.otpTtlSeconds / 60),
      }),
    );

    return transfer;
  },

  async pendingForMember(memberId: unknown): Promise<unknown[]> {
    const items = await GymTransfer.find({
      member: memberId,
      status: TRANSFER_STATUS.PENDING,
      expiresAt: { $gt: new Date() },
    })
      .populate('fromGym', 'name')
      .populate('toGym', 'name')
      .sort({ createdAt: -1 });
    return items;
  },

  async resendOtp(transferId: string, memberId: unknown): Promise<{ sent: true; otp?: string }> {
    const transfer = await GymTransfer.findById(transferId).select('+otpHash +otpExpires');
    if (!transfer || String(transfer.member) !== String(memberId)) {
      throw ApiError.notFound('Transfer request not found');
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING) throw ApiError.badRequest('Transfer is no longer pending');
    if (transfer.expiresAt < new Date()) {
      transfer.status = TRANSFER_STATUS.EXPIRED;
      await transfer.save();
      throw ApiError.badRequest('Transfer request expired');
    }

    const member = await User.findById(memberId);
    if (!member) throw ApiError.notFound('Account not found');
    const otp = generateOtp();
    transfer.otpHash = hashToken(otp);
    transfer.otpExpires = new Date(Date.now() + env.otpTtlSeconds * 1000);
    await transfer.save();
    member.otpHash = hashToken(otp);
    member.otpExpires = transfer.otpExpires;
    member.otpPurpose = 'gym_transfer';
    await member.save();

    const [fromGym, toGym] = await Promise.all([
      Gym.findById(transfer.fromGym).select('name'),
      Gym.findById(transfer.toGym).select('name'),
    ]);
    await mailService.send(
      member.email,
      gymTransferRequestEmail({
        name: member.name,
        fromGym: fromGym?.name ?? 'your current gym',
        toGym: toGym?.name ?? 'the new gym',
        code: otp,
        minutes: Math.round(env.otpTtlSeconds / 60),
      }),
    );
    return { sent: true, ...(env.isProd ? {} : { otp }) };
  },

  async accept(transferId: string, member: UserDocument): Promise<UserDocument> {
    const transfer = await GymTransfer.findById(transferId);
    if (!transfer || String(transfer.member) !== String(member._id)) {
      throw ApiError.notFound('Transfer request not found');
    }
    return this.complete(transfer, member);
  },

  async decline(transferId: string, member: UserDocument): Promise<void> {
    const transfer = await GymTransfer.findById(transferId);
    if (!transfer || String(transfer.member) !== String(member._id)) {
      throw ApiError.notFound('Transfer request not found');
    }
    if (transfer.status !== TRANSFER_STATUS.PENDING) throw ApiError.badRequest('Transfer is no longer pending');
    transfer.status = TRANSFER_STATUS.DECLINED;
    await transfer.save();
  },

  async completeByOtp(email: string, otp: string): Promise<UserDocument> {
    const member = await User.findOne({ email, deletedAt: null }).select('+otpHash +otpExpires +otpPurpose');
    if (!member || !member.otpHash) throw ApiError.badRequest('No transfer code requested');
    if (!member.otpExpires || member.otpExpires < new Date()) throw ApiError.badRequest('Code expired');
    if (member.otpPurpose !== 'gym_transfer') throw ApiError.badRequest('Code purpose mismatch');
    if (member.otpHash !== hashToken(otp)) throw ApiError.badRequest('Incorrect code');

    const transfer = await GymTransfer.findOne({
      member: member._id,
      status: TRANSFER_STATUS.PENDING,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
    if (!transfer) throw ApiError.notFound('No pending gym transfer');
    return this.complete(transfer, member);
  },

  async complete(transfer: GymTransferDocument, member: UserDocument): Promise<UserDocument> {
    if (transfer.status !== TRANSFER_STATUS.PENDING) throw ApiError.badRequest('Transfer is no longer pending');
    if (transfer.expiresAt < new Date()) {
      transfer.status = TRANSFER_STATUS.EXPIRED;
      await transfer.save();
      throw ApiError.badRequest('Transfer request expired');
    }

    const fromGymId = transfer.fromGym;
    const toGymId = transfer.toGym;

    await Subscription.updateMany(
      { member: member._id, gym: fromGymId, status: SUBSCRIPTION_STATUS.ACTIVE },
      { $set: { status: SUBSCRIPTION_STATUS.CANCELLED, cancelledAt: new Date(), autoRenew: false } },
    );

    await closeTenure(member._id, fromGymId, TENURE_END_REASON.TRANSFERRED);
    await openTenure(member._id, toGymId);

    member.gym = toGymId as typeof member.gym;
    member.status = USER_STATUS.ACTIVE;
    if (member.memberProfile) {
      member.memberProfile.assignedTrainer = null;
    }
    member.otpHash = undefined;
    member.otpExpires = undefined;
    member.otpPurpose = undefined;
    await member.save();

    transfer.status = TRANSFER_STATUS.ACCEPTED;
    transfer.acknowledgedAt = new Date();
    transfer.completedAt = new Date();
    await transfer.save();

    await RefreshToken.updateMany({ user: member._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

    const [fromGym, toGym] = await Promise.all([
      Gym.findById(fromGymId).select('name'),
      Gym.findById(toGymId).select('name'),
    ]);
    await mailService.send(
      member.email,
      gymTransferCompleteEmail({
        name: member.name,
        fromGym: fromGym?.name ?? 'previous gym',
        toGym: toGym?.name ?? 'your new gym',
      }),
    );

    return member;
  },
};

export default transferService;
