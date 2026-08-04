import mongoose, { type ClientSession } from 'mongoose';
import { User, type UserDocument } from '../users/user.model';
import { Gym, type GymDocument } from '../gyms/gym.model';
import { RefreshToken } from './refreshToken.model';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { ROLES, USER_STATUS, GYM_STATUS } from '../../config/constants';
import { uniqueSlug } from '../../utils/slug';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  randomToken,
  generateOtp,
} from '../../utils/tokens';
import { logger } from '../../config/logger';
import type { AuthTokenPayload } from '../../types/index';
import type {
  RegisterInput,
  LoginInput,
  RefreshInput,
  LogoutInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './auth.validators';

export interface RequestContext {
  userAgent?: string;
  ip?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

function buildAccessPayload(user: UserDocument): Pick<AuthTokenPayload, 'sub' | 'role' | 'gym'> {
  return { sub: String(user._id), role: user.role, gym: user.gym ? String(user.gym) : null };
}

async function issueTokens(user: UserDocument, ctx: RequestContext = {}): Promise<TokenPair> {
  const accessToken = signAccessToken(buildAccessPayload(user));
  const refreshToken = signRefreshToken({ sub: String(user._id) });
  const decoded = verifyRefreshToken(refreshToken);
  await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(refreshToken),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
    expiresAt: new Date((decoded.exp ?? 0) * 1000),
  });
  return { accessToken, refreshToken };
}

async function createOwnerAndGym(input: RegisterInput, session?: ClientSession): Promise<{ user: UserDocument; gym: GymDocument }> {
  const slug = await uniqueSlug(Gym, input.gymName);
  const user = new User({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: ROLES.GYM_OWNER,
    status: USER_STATUS.ACTIVE,
    passwordHash: 'pending',
  });
  await user.setPassword(input.password);
  await user.save({ session });

  const gym = new Gym({
    name: input.gymName,
    slug,
    owner: user._id,
    email: input.email,
    phone: input.phone,
    status: GYM_STATUS.TRIAL,
    trialEndsAt: new Date(Date.now() + TRIAL_MS),
  });
  await gym.save({ session });

  user.gym = gym._id;
  await user.save({ session });
  return { user, gym };
}

export const authService = {
  /** Onboarding: creates a gym_owner and their gym (transaction when supported). */
  async register(input: RegisterInput, ctx: RequestContext = {}) {
    const existing = await User.findOne({ email: input.email });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    let created: { user: UserDocument; gym: GymDocument };
    const session = await mongoose.startSession();
    try {
      let result!: { user: UserDocument; gym: GymDocument };
      await session.withTransaction(async () => {
        result = await createOwnerAndGym(input, session);
      });
      created = result;
    } catch (err) {
      // Fallback for standalone Mongo (no transactions): retry without a session.
      const message = err instanceof Error ? err.message : '';
      if ((err as { code?: number })?.code === 20 || /Transaction numbers/.test(message)) {
        created = await createOwnerAndGym(input);
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }

    const tokens = await issueTokens(created.user, ctx);
    return { user: created.user, gym: created.gym, ...tokens };
  },

  async login({ email, password }: LoginInput, ctx: RequestContext = {}) {
    const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
    if (!user) throw ApiError.unauthorized('Invalid credentials');
    const ok = await user.comparePassword(password);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');
    if (user.status === USER_STATUS.SUSPENDED) throw ApiError.forbidden('Account suspended');

    user.lastLoginAt = new Date();
    await user.save();
    const tokens = await issueTokens(user, ctx);
    return { user, ...tokens };
  },

  /** Rotate refresh token: verify, ensure stored & not revoked, revoke old, issue new. */
  async refresh({ refreshToken }: RefreshInput, ctx: RequestContext = {}) {
    let decoded: AuthTokenPayload;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
    if (!stored || stored.revokedAt) throw ApiError.unauthorized('Refresh token revoked');

    const user = await User.findById(decoded.sub);
    if (!user || user.deletedAt) throw ApiError.unauthorized('Account not found');

    const tokens = await issueTokens(user, ctx);
    stored.revokedAt = new Date();
    stored.replacedByHash = hashToken(tokens.refreshToken);
    await stored.save();

    return { user, ...tokens };
  },

  async logout({ refreshToken }: LogoutInput): Promise<void> {
    if (!refreshToken) return;
    await RefreshToken.updateOne(
      { tokenHash: hashToken(refreshToken), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  },

  async logoutAll(userId: unknown): Promise<void> {
    await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  },

  async changePassword(user: UserDocument, { currentPassword, newPassword }: ChangePasswordInput): Promise<void> {
    const full = await User.findById(user._id).select('+passwordHash');
    if (!full) throw ApiError.notFound('Account not found');
    const ok = await full.comparePassword(currentPassword);
    if (!ok) throw ApiError.badRequest('Current password is incorrect');
    await full.setPassword(newPassword);
    await full.save();
    await this.logoutAll(user._id);
  },

  async forgotPassword({ email }: ForgotPasswordInput): Promise<{ sent: true; resetToken?: string }> {
    const user = await User.findOne({ email, deletedAt: null });
    if (!user) return { sent: true }; // do not leak existence
    const token = randomToken();
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    logger.info({ email }, 'Password reset requested');
    return { sent: true, ...(env.isProd ? {} : { resetToken: token }) };
  },

  async resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
    const user = await User.findOne({
      resetTokenHash: hashToken(token),
      resetTokenExpires: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpires');
    if (!user) throw ApiError.badRequest('Invalid or expired reset token');
    await user.setPassword(password);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    await this.logoutAll(user._id);
  },

  async requestOtp({ email, purpose }: RequestOtpInput): Promise<{ sent: true; otp?: string }> {
    const user = await User.findOne({ email, deletedAt: null });
    if (!user) return { sent: true };
    const otp = generateOtp();
    user.otpHash = hashToken(otp);
    user.otpExpires = new Date(Date.now() + env.otpTtlSeconds * 1000);
    user.otpPurpose = purpose;
    await user.save();
    logger.info({ email, purpose }, 'OTP generated');
    return { sent: true, ...(env.isProd ? {} : { otp }) };
  },

  async verifyOtp({ email, otp, purpose }: VerifyOtpInput, ctx: RequestContext = {}) {
    const user = await User.findOne({ email, deletedAt: null }).select('+otpHash +otpExpires +otpPurpose');
    if (!user || !user.otpHash) throw ApiError.badRequest('No OTP requested');
    if (!user.otpExpires || user.otpExpires < new Date()) throw ApiError.badRequest('OTP expired');
    if (user.otpPurpose !== purpose) throw ApiError.badRequest('OTP purpose mismatch');
    if (user.otpHash !== hashToken(otp)) throw ApiError.badRequest('Incorrect OTP');

    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpPurpose = undefined;
    if (purpose === 'verify_email') user.emailVerified = true;
    await user.save();

    if (purpose === 'login') {
      const tokens = await issueTokens(user, ctx);
      return { verified: true as const, user, ...tokens };
    }
    return { verified: true as const };
  },
};

export default authService;
