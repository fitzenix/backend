import mongoose, { type ClientSession } from 'mongoose';
import { User, type UserDocument } from '../users/user.model';
import { Gym, type GymDocument } from '../gyms/gym.model';
import { RefreshToken } from './refreshToken.model';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { ROLES, USER_STATUS, GYM_STATUS, TRIAL_DAYS } from '../../config/constants';
import { uniqueSlug } from '../../utils/slug';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateOtp,
} from '../../utils/tokens';
import { mailService } from '../../services/mail/mail.service';
import {
  otpEmail,
  welcomeEmail,
} from '../../services/mail/templates';
import { transferService } from '../users/transfer.service';
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

const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

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
    status: USER_STATUS.PENDING,
    emailVerified: false,
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
  async register(input: RegisterInput, _ctx: RequestContext = {}) {
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

    const otp = generateOtp();
    created.user.otpHash = hashToken(otp);
    created.user.otpExpires = new Date(Date.now() + env.otpTtlSeconds * 1000);
    created.user.otpPurpose = 'verify_email';
    await created.user.save();

    await mailService.send(
      created.user.email,
      welcomeEmail({ name: created.user.name, gymName: created.gym.name }),
    );
    await mailService.send(
      created.user.email,
      otpEmail({
        name: created.user.name,
        code: otp,
        purpose: 'verify_email',
        minutes: Math.round(env.otpTtlSeconds / 60),
      }),
    );

    return {
      needsEmailVerification: true as const,
      email: created.user.email,
      user: created.user,
      gym: created.gym,
      ...(env.isProd ? {} : { otp }),
    };
  },

  async login({ email, password }: LoginInput, ctx: RequestContext = {}) {
    const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
    if (!user) throw ApiError.unauthorized('Invalid credentials');
    const ok = await user.comparePassword(password);
    if (!ok) throw ApiError.unauthorized('Invalid credentials');
    if (user.status === USER_STATUS.SUSPENDED) throw ApiError.forbidden('Account suspended');
    if (!user.emailVerified) {
      throw ApiError.emailNotVerified('Verify your email before signing in. We can resend the code.', {
        email: user.email,
        canResend: true,
      });
    }

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

  async forgotPassword({ email }: ForgotPasswordInput): Promise<{ sent: true; otp?: string }> {
    const user = await User.findOne({ email, deletedAt: null });
    if (!user) throw ApiError.badRequest('Please enter a valid email address.');
    const otp = generateOtp();
    user.otpHash = hashToken(otp);
    user.otpExpires = new Date(Date.now() + env.otpTtlSeconds * 1000);
    user.otpPurpose = 'reset';
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    await mailService.send(
      email,
      otpEmail({
        name: user.name,
        code: otp,
        purpose: 'reset',
        minutes: Math.round(env.otpTtlSeconds / 60),
      }),
    );
    return { sent: true, ...(env.isProd ? {} : { otp }) };
  },

  async resetPassword({ email, otp, password }: ResetPasswordInput): Promise<void> {
    const user = (await User.findOne({ email, deletedAt: null }).select(
      '+otpHash +otpExpires +otpPurpose +resetTokenHash +resetTokenExpires',
    )) as UserDocument | null;
    if (!user || !user.otpHash) throw ApiError.badRequest('No reset code requested');
    if (!user.otpExpires || user.otpExpires < new Date()) throw ApiError.badRequest('Reset code expired');
    if (user.otpPurpose !== 'reset') throw ApiError.badRequest('Reset code purpose mismatch');
    if (user.otpHash !== hashToken(otp)) throw ApiError.badRequest('Incorrect reset code');
    await user.setPassword(password);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpPurpose = undefined;
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
    await mailService.send(
      email,
      otpEmail({
        name: user.name,
        code: otp,
        purpose,
        minutes: Math.round(env.otpTtlSeconds / 60),
      }),
    );
    return { sent: true, ...(env.isProd ? {} : { otp }) };
  },

  async verifyOtp({ email, otp, purpose }: VerifyOtpInput, ctx: RequestContext = {}) {
    if (purpose === 'gym_transfer') {
      const member = await transferService.completeByOtp(email, otp);
      return { verified: true as const, transferred: true as const, user: member };
    }

    const user = await User.findOne({ email, deletedAt: null }).select('+otpHash +otpExpires +otpPurpose');
    if (!user || !user.otpHash) throw ApiError.badRequest('No OTP requested');
    if (!user.otpExpires || user.otpExpires < new Date()) throw ApiError.badRequest('OTP expired');
    if (user.otpPurpose !== purpose) throw ApiError.badRequest('OTP purpose mismatch');
    if (user.otpHash !== hashToken(otp)) throw ApiError.badRequest('Incorrect OTP');

    if (purpose === 'reset') {
      throw ApiError.badRequest('Enter your reset code on the new password screen');
    }

    user.otpHash = undefined;
    user.otpExpires = undefined;
    user.otpPurpose = undefined;
    if (purpose === 'verify_email') {
      user.emailVerified = true;
      if (user.status === USER_STATUS.PENDING) user.status = USER_STATUS.ACTIVE;
      user.lastLoginAt = new Date();
      await user.save();
      const tokens = await issueTokens(user, ctx);
      return { verified: true as const, emailVerified: true as const, user, ...tokens };
    }
    await user.save();

    if (purpose === 'login') {
      if (!user.emailVerified) {
        throw ApiError.emailNotVerified('Verify your email before signing in', { email: user.email });
      }
      const tokens = await issueTokens(user, ctx);
      return { verified: true as const, user, ...tokens };
    }
    return { verified: true as const, emailVerified: user.emailVerified };
  },
};

export default authService;
