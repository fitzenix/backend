import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ROLES, SUBSCRIPTION_STATUS, USER_STATUS, GYM_STATUS } from '../../config/constants';
import { Gym } from '../gyms/gym.model';
import { User } from '../users/user.model';
import { RefreshToken } from '../auth/refreshToken.model';
import { Attendance } from '../attendance/attendance.model';
import { Subscription } from '../memberships/subscription.model';
import { Payment } from '../payments/payment.model';
import { Invoice } from '../payments/invoice.model';
import { WorkoutPlan } from '../fitness/workoutPlan.model';
import { DietPlan } from '../fitness/dietPlan.model';
import { WorkoutTemplate } from '../fitness/workoutTemplate.model';
import { ProgressLog } from '../fitness/progressLog.model';
import { GymTenure } from '../users/gymTenure.model';
import { GymTransfer } from '../users/gymTransfer.model';
import { Post } from '../feed/post.model';
import { Conversation } from '../chat/conversation.model';
import { Message } from '../chat/message.model';
import { DeviceToken } from '../notifications/deviceToken.model';
import { Notification } from '../notifications/notification.model';
import { NotificationLog } from '../notifications/notificationLog.model';
import { NotificationQueue } from '../notifications/notificationQueue.model';
import { NotificationPreferences } from '../notifications/notificationPreference.model';
import { NotificationTemplate } from '../notifications/notificationTemplate.model';
import { NotificationTopic } from '../notifications/notificationTopic.model';
import { Expense } from '../finance/expense.model';
import { Enquiry } from '../enquiries/enquiry.model';
import { storageService } from '../../services/storage.service';
import { deviceTokenService } from '../notifications/deviceToken.service';
import { mailService } from '../../services/mail/mail.service';
import {
  accountDeletionCompleteEmail,
  accountDeletionSupportReviewEmail,
  accountDeletionVerificationEmail,
} from '../../services/mail/templates';
import { ApiError } from '../../utils/ApiError';
import { authUserCache, bustGym } from '../../utils/hotCache';
import { generateOtp } from '../../utils/tokens';
import { AccountDeletionRequest } from './accountDeletion.model';
import type {
  CreateDeletionRequestInput,
  DeletionStatusInput,
  ResolveOwnerDeletionInput,
  VerifyDeletionRequestInput,
} from './accountDeletion.validators';
import type { StorageObject } from '../../types/index';

const MAX_CODE_ATTEMPTS = 5;
const GENERIC_VERIFICATION_ERROR = 'The verification code is invalid or expired.';

function hashDeletionSecret(value: string): string {
  return crypto
    .createHmac('sha256', env.jwt.refreshSecret)
    .update(`fitzenix:account-deletion:${value}`)
    .digest('hex');
}

function matchesHash(value: string, expected: string): boolean {
  const actualBuffer = Buffer.from(hashDeletionSecret(value), 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function newTrackingToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function expectedRoles(role: CreateDeletionRequestInput['role']): string[] {
  if (role === 'gym_owner') return [ROLES.GYM_OWNER];
  if (role === 'member') return [ROLES.MEMBER];
  return [ROLES.TRAINER, ROLES.STAFF];
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function roleSnapshot(role: CreateDeletionRequestInput['role']): 'gym_owner' | 'trainer' | 'staff' | 'member' {
  if (role === 'gym_owner') return ROLES.GYM_OWNER;
  if (role === 'member') return ROLES.MEMBER;
  return ROLES.TRAINER;
}

async function lookupUser(input: CreateDeletionRequestInput) {
  const identity = input.identity.trim();
  const isEmail = identity.includes('@');
  const filter = isEmail ? { email: identity.toLowerCase() } : { phone: identity };
  const users = await User.find({
    ...filter,
    role: { $in: expectedRoles(input.role) },
    deletedAt: null,
  }).limit(2);
  if (users.length !== 1) return null;

  const user = users[0];
  if (!user.gym) return null;
  const gym = await Gym.findOne({ _id: user.gym, deletedAt: null }).select('name owner');
  if (!gym || (input.gymName && normalizedName(gym.name) !== normalizedName(input.gymName))) return null;
  if (input.role === 'gym_owner' && String(gym.owner) !== String(user._id)) return null;
  return { user, gym };
}

async function sendVerificationCode(email: string, name: string, code: string): Promise<void> {
  await mailService.send(
    email,
    accountDeletionVerificationEmail({
      name,
      code,
      minutes: Math.max(1, Math.ceil(env.otpTtlSeconds / 60)),
    }),
  );
}

async function collectMediaObjects(userId: Types.ObjectId, role: string): Promise<StorageObject[]> {
  const user = await User.findById(userId).select('avatar');
  const media: StorageObject[] = user?.avatar?.key ? [user.avatar] : [];
  const posts = await Post.find({ author: userId }).select('images');
  for (const post of posts) media.push(...post.images.filter((image) => image?.key));

  if (role === ROLES.MEMBER) {
    const progress = await ProgressLog.find({ member: userId }).select('photo');
    for (const row of progress) {
      if (row.photo?.key) media.push(row.photo);
    }
  }

  const unique = new Map<string, StorageObject>();
  for (const object of media) {
    if (object.key) unique.set(object.key, object);
  }
  return [...unique.values()];
}

async function eraseUserData(requestId: Types.ObjectId): Promise<void> {
  const request = await AccountDeletionRequest.findById(requestId).select('+notificationEmail');
  if (!request || request.status !== 'processing' || !request.user) return;

  const userId = request.user;
  const user = await User.findById(userId);
  if (!user) {
    request.status = 'completed';
    request.isOpen = false;
    request.completedAt = new Date();
    request.user = null;
    request.gym = null;
    request.reason = undefined;
    await request.save();
    return;
  }

  const role = request.role;
  const gymId = request.gym;
  const media = await collectMediaObjects(userId, role);
  for (const object of media) {
    await storageService.deleteStrict(object.key, object.url);
  }

  await deviceTokenService.deactivate(String(userId));

  if (role === ROLES.MEMBER) {
    await Attendance.deleteMany({ member: userId });
    await ProgressLog.deleteMany({ member: userId });
    await WorkoutPlan.deleteMany({ member: userId });
    await DietPlan.deleteMany({ member: userId });
    await GymTenure.deleteMany({ member: userId });
    await GymTransfer.deleteMany({ member: userId });
    await Subscription.updateMany(
      { member: userId },
      {
        $set: {
          status: SUBSCRIPTION_STATUS.CANCELLED,
          autoRenew: false,
          cancelledAt: new Date(),
          expiryRemindersSent: [],
        },
        $unset: { lastExpiryReminderAt: 1 },
      },
    );
  }

  await Attendance.updateMany({ recordedBy: userId }, { $set: { recordedBy: null } });
  await User.updateMany(
    { 'memberProfile.assignedTrainer': userId },
    { $set: { 'memberProfile.assignedTrainer': null } },
  );
  await WorkoutPlan.updateMany({ trainer: userId }, { $set: { trainer: null } });
  await DietPlan.updateMany({ trainer: userId }, { $set: { trainer: null } });
  await WorkoutTemplate.updateMany({ trainer: userId }, { $set: { trainer: null } });
  await ProgressLog.updateMany({ recordedBy: userId }, { $set: { recordedBy: null } });

  await Post.deleteMany({ author: userId });
  await Post.updateMany({}, { $pull: { likes: userId, comments: { author: userId } } });

  const conversations = await Conversation.find({ participants: userId }).select('_id');
  const conversationIds = conversations.map((conversation) => conversation._id);
  await Message.deleteMany({ sender: userId });
  await Message.updateMany({ readBy: userId }, { $pull: { readBy: userId } });
  if (conversationIds.length) {
    await Conversation.updateMany(
      { _id: { $in: conversationIds } },
      {
        $pull: { participants: userId },
        $unset: { [`unread.${String(userId)}`]: 1 },
      },
    );
    await Conversation.updateMany(
      { _id: { $in: conversationIds }, 'lastMessage.sender': userId },
      { $set: { lastMessage: null } },
    );
    await Conversation.deleteMany({ _id: { $in: conversationIds }, participants: { $size: 0 } });
  }

  await Notification.deleteMany({ user: userId });
  await NotificationLog.deleteMany({ user: userId });
  await NotificationPreferences.deleteMany({ user: userId });
  await NotificationQueue.deleteMany({ user: userId });
  await NotificationQueue.updateMany({ userIds: userId }, { $pull: { userIds: userId } });
  await NotificationTemplate.updateMany(
    { $or: [{ createdBy: userId }, { updatedBy: userId }] },
    { $set: { createdBy: null, updatedBy: null } },
  );
  await NotificationTopic.updateMany(
    { $or: [{ createdBy: userId }, { updatedBy: userId }] },
    { $set: { createdBy: null, updatedBy: null } },
  );
  await DeviceToken.deleteMany({ user: userId });

  await Payment.updateMany({ member: userId }, { $set: { notes: {}, raw: {} } });
  await Invoice.updateMany(
    { $or: [{ member: userId }, { createdBy: userId }] },
    { $unset: { note: 1 }, $set: { createdBy: null } },
  );
  await Expense.updateMany({ recordedBy: userId }, { $set: { recordedBy: null } });
  await Enquiry.updateMany({ createdBy: userId }, { $set: { createdBy: null } });
  await Enquiry.updateMany(
    { convertedMember: userId },
    {
      $set: { name: 'Deleted account', convertedMember: null },
      $unset: { email: 1, phone: 1, note: 1 },
    },
  );
  await GymTransfer.deleteMany({ $or: [{ member: userId }, { requestedBy: userId }] });

  if (role === ROLES.GYM_OWNER && request.ownerResolution === 'closed' && gymId) {
    await Gym.updateOne({ _id: gymId }, { $set: { status: GYM_STATUS.SUSPENDED } });
  }

  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await RefreshToken.deleteMany({ user: userId });

  user.name = 'Deleted account';
  user.email = `deleted-${String(user._id)}@account.invalid`;
  user.phone = undefined;
  await user.setPassword(crypto.randomBytes(32).toString('base64url'));
  user.gym = null;
  user.status = USER_STATUS.INACTIVE;
  user.deletedAt = new Date();
  user.avatar = undefined;
  user.emailVerified = false;
  user.lastLoginAt = undefined;
  user.trainerProfile = undefined;
  user.staffProfile = undefined;
  user.memberProfile = undefined;
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.otpPurpose = undefined;
  await user.save();
  authUserCache.delete(String(userId));
  if (gymId) bustGym(gymId);

  request.status = 'completed';
  request.isOpen = false;
  request.processingAt = undefined;
  request.completedAt = new Date();
  request.user = null;
  request.gym = null;
  request.reason = undefined;
  request.codeHash = undefined;
  await request.save();

  if (request.notificationEmail) {
    try {
      await mailService.send(request.notificationEmail, accountDeletionCompleteEmail());
      request.notificationEmail = undefined;
      await request.save();
    } catch (err) {
      logger.warn({ err, requestId: String(request._id) }, 'Account deletion completion email failed');
    }
  }
}

async function applyOwnerResolution(request: {
  user: Types.ObjectId | null;
  gym: Types.ObjectId | null;
  ownerResolution?: 'transferred' | 'closed';
  newOwner?: Types.ObjectId;
}): Promise<void> {
  if (!request.user || !request.gym || !request.ownerResolution) {
    throw new Error('Gym-owner deletion request is missing its support resolution');
  }

  const [owner, gym] = await Promise.all([
    User.findOne({ _id: request.user, role: ROLES.GYM_OWNER, deletedAt: null }),
    Gym.findOne({ _id: request.gym, deletedAt: null }),
  ]);
  if (!gym) throw new Error('Gym is unavailable for support resolution');

  if (request.ownerResolution === 'closed') {
    if (!owner && String(gym.owner) === String(request.user) && gym.status === GYM_STATUS.SUSPENDED) {
      return;
    }
    if (!owner || String(gym.owner) !== String(owner._id)) {
      throw new Error('Gym ownership changed before closure resolution could be applied');
    }
    const closure = await Gym.updateOne(
      { _id: gym._id, owner: owner._id },
      { $set: { status: GYM_STATUS.SUSPENDED } },
    );
    if (closure.matchedCount !== 1) throw new Error('Gym ownership changed while applying the closure');
    bustGym(gym._id);
    return;
  }

  if (!request.newOwner) throw new Error('Ownership transfer request is missing the selected successor');
  const successor = await User.findOne({
    _id: request.newOwner,
    gym: gym._id,
    role: { $in: [ROLES.TRAINER, ROLES.STAFF, ROLES.GYM_OWNER] },
    status: USER_STATUS.ACTIVE,
    deletedAt: null,
  });
  if (!successor) throw new Error('Selected ownership successor is no longer active in this gym');

  if (String(gym.owner) === String(successor._id)) {
    if (successor.role !== ROLES.GYM_OWNER) {
      throw new Error('Gym ownership and successor role are inconsistent');
    }
    authUserCache.delete(String(successor._id));
    bustGym(gym._id);
    return;
  }
  if (!owner) throw new Error('Gym-owner account is unavailable before the transfer was applied');
  if (String(gym.owner) !== String(owner._id)) {
    throw new Error('Gym ownership changed before transfer resolution could be applied');
  }

  if (successor.role !== ROLES.GYM_OWNER) {
    const promotion = await User.updateOne(
      {
        _id: successor._id,
        gym: gym._id,
        role: successor.role,
        status: USER_STATUS.ACTIVE,
        deletedAt: null,
      },
      { $set: { role: ROLES.GYM_OWNER } },
    );
    if (promotion.matchedCount !== 1) throw new Error('Selected successor changed during ownership transfer');
  }
  authUserCache.delete(String(successor._id));

  const transfer = await Gym.updateOne(
    { _id: gym._id, owner: owner._id },
    { $set: { owner: successor._id } },
  );
  if (transfer.matchedCount !== 1) {
    throw new Error('Gym ownership changed while applying the transfer');
  }
  bustGym(gym._id);
}

export const accountDeletionService = {
  async request(input: CreateDeletionRequestInput): Promise<{
    requestId: string;
    trackingToken: string;
    status: string;
  }> {
    const account = await lookupUser(input);
    const trackingToken = newTrackingToken();
    const code = generateOtp();

    if (!account) {
      const decoy = await AccountDeletionRequest.create({
        user: null,
        gym: null,
        role: roleSnapshot(input.role),
        status: 'pending_verification',
        isOpen: false,
        trackingTokenHash: hashDeletionSecret(trackingToken),
        attempts: 0,
        expiresAt: new Date(Date.now() + env.otpTtlSeconds * 1000),
      });
      return { requestId: String(decoy._id), trackingToken, status: decoy.status };
    }

    let request = await AccountDeletionRequest.findOne({ user: account.user._id, isOpen: true }).select('+codeHash');
    if (!request) {
      request = new AccountDeletionRequest({
        user: account.user._id,
        gym: account.gym._id,
        role: account.user.role,
        status: 'pending_verification',
        isOpen: true,
        attempts: 0,
        reason: input.reason,
      });
    }

    request.trackingTokenHash = hashDeletionSecret(trackingToken);
    if (request.status === 'pending_verification') {
      request.codeHash = hashDeletionSecret(code);
      request.expiresAt = new Date(Date.now() + env.otpTtlSeconds * 1000);
      request.attempts = 0;
      request.reason = input.reason;
    }
    await request.save();

    if (request.status === 'pending_verification') {
      try {
        await sendVerificationCode(account.user.email, account.user.name, code);
      } catch (err) {
        logger.warn({ err, requestId: String(request._id) }, 'Account deletion verification email failed');
      }
    }

    return { requestId: String(request._id), trackingToken, status: request.status };
  },

  async verify(input: VerifyDeletionRequestInput): Promise<{ requestId: string; status: string }> {
    const request = await AccountDeletionRequest.findById(input.requestId).select('+codeHash');
    if (
      !request ||
      request.status !== 'pending_verification' ||
      !request.expiresAt ||
      request.expiresAt.getTime() <= Date.now() ||
      !request.codeHash ||
      !request.user ||
      !matchesHash(input.code, request.codeHash)
    ) {
      if (
        request?.status === 'pending_verification' &&
        request.expiresAt &&
        request.expiresAt.getTime() <= Date.now()
      ) {
        await AccountDeletionRequest.updateOne(
          { _id: request._id, status: 'pending_verification', expiresAt: { $lte: new Date() } },
          { $set: { status: 'failed', isOpen: false }, $unset: { codeHash: 1 } },
        );
      } else if (request?.status === 'pending_verification' && request.user && request.codeHash) {
        const update =
          request.attempts + 1 >= MAX_CODE_ATTEMPTS
            ? {
                $inc: { attempts: 1 },
                $set: { status: 'failed', isOpen: false },
                $unset: { codeHash: 1 },
              }
            : { $inc: { attempts: 1 } };
        await AccountDeletionRequest.updateOne(
          {
            _id: request._id,
            status: 'pending_verification',
            codeHash: request.codeHash,
            attempts: request.attempts,
            expiresAt: { $gt: new Date() },
          },
          update,
        );
      }
      throw ApiError.badRequest(GENERIC_VERIFICATION_ERROR);
    }

    const user = await User.findOne({ _id: request.user, deletedAt: null });
    if (!user || user.role === ROLES.SUPER_ADMIN || user.role !== request.role) {
      await AccountDeletionRequest.updateOne(
        { _id: request._id, status: 'pending_verification' },
        { $set: { status: 'failed', isOpen: false }, $unset: { codeHash: 1 } },
      );
      throw ApiError.badRequest(GENERIC_VERIFICATION_ERROR);
    }

    const verifiedRequest = await AccountDeletionRequest.findOneAndUpdate(
      {
        _id: request._id,
        status: 'pending_verification',
        codeHash: request.codeHash,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: MAX_CODE_ATTEMPTS },
      },
      {
        $set: {
          status: user.role === ROLES.GYM_OWNER ? 'awaiting_support_review' : 'processing',
          verifiedAt: new Date(),
          notificationEmail: user.email,
        },
        $unset: { codeHash: 1, expiresAt: 1 },
      },
      { new: true },
    );
    if (!verifiedRequest) throw ApiError.badRequest(GENERIC_VERIFICATION_ERROR);

    if (user.role === ROLES.GYM_OWNER) {
      try {
        await this.notifySupportReview(verifiedRequest._id);
      } catch (err) {
        logger.warn({ err, requestId: String(verifiedRequest._id) }, 'Account deletion support alert failed');
      }
      return { requestId: String(verifiedRequest._id), status: verifiedRequest.status };
    }

    await this.process(verifiedRequest._id);
    const updated = await AccountDeletionRequest.findById(verifiedRequest._id).select('status');
    return { requestId: String(verifiedRequest._id), status: updated?.status ?? 'processing' };
  },

  async status(input: DeletionStatusInput): Promise<{ status: string }> {
    const request = await AccountDeletionRequest.findById(input.requestId).select('+trackingTokenHash');
    if (!request || !matchesHash(input.trackingToken, request.trackingTokenHash)) {
      throw ApiError.notFound('Deletion request not found');
    }
    return { status: request.status };
  },

  async listForSupport({ page, limit }: { page: number; limit: number }) {
    const [items, total] = await Promise.all([
      AccountDeletionRequest.find({ status: 'awaiting_support_review', role: ROLES.GYM_OWNER })
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('user', 'name email phone')
        .populate('gym', 'name status')
        .lean(),
      AccountDeletionRequest.countDocuments({ status: 'awaiting_support_review', role: ROLES.GYM_OWNER }),
    ]);
    return { items, page, limit, total };
  },

  async resolveOwnerRequest(
    requestId: string,
    input: ResolveOwnerDeletionInput,
    reviewerId: Types.ObjectId,
  ): Promise<{ requestId: string; status: string }> {
    const request = await AccountDeletionRequest.findOne({
      _id: requestId,
      role: ROLES.GYM_OWNER,
      status: 'awaiting_support_review',
      isOpen: true,
    });
    if (!request?.user || !request.gym) throw ApiError.notFound('Owner deletion request not found');

    const owner = await User.findOne({ _id: request.user, role: ROLES.GYM_OWNER, deletedAt: null });
    const gym = await Gym.findOne({ _id: request.gym, deletedAt: null });
    if (!owner || !gym || String(gym.owner) !== String(owner._id)) {
      throw ApiError.conflict('Gym ownership changed. Refresh the request before resolving it.');
    }

    let newOwnerId: Types.ObjectId | undefined;
    if (input.resolution === 'transferred') {
      const newOwner = await User.findOne({
        _id: input.newOwnerId,
        gym: gym._id,
        role: { $in: [ROLES.TRAINER, ROLES.STAFF] },
        status: USER_STATUS.ACTIVE,
        deletedAt: null,
      });
      if (!newOwner) {
        throw ApiError.badRequest('The replacement owner must be an active trainer or staff member in this gym.');
      }
      newOwnerId = newOwner._id;
    }

    const processingAt = new Date();
    const claimed = await AccountDeletionRequest.findOneAndUpdate(
      { _id: request._id, status: 'awaiting_support_review', isOpen: true },
      {
        $set: {
          status: 'processing',
          processingAt,
          ownerResolution: input.resolution,
          reviewedBy: reviewerId,
          reviewedAt: processingAt,
          ...(newOwnerId ? { newOwner: newOwnerId } : {}),
        },
      },
      { new: true },
    );
    if (!claimed) throw ApiError.conflict('This owner request has already been resolved.');

    await applyOwnerResolution(claimed);
    const unlocked = await AccountDeletionRequest.updateOne(
      { _id: claimed._id, status: 'processing', processingAt },
      { $unset: { processingAt: 1 } },
    );
    if (unlocked.matchedCount !== 1) throw ApiError.conflict('Owner request changed while being resolved.');

    await this.process(request._id);
    const updated = await AccountDeletionRequest.findById(request._id).select('status');
    return { requestId: String(request._id), status: updated?.status ?? 'processing' };
  },

  async process(requestId: Types.ObjectId | string): Promise<void> {
    const staleLock = new Date(Date.now() - 10 * 60 * 1000);
    const request = await AccountDeletionRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: 'processing',
        $or: [{ processingAt: null }, { processingAt: { $exists: false } }, { processingAt: { $lt: staleLock } }],
      },
      { $set: { processingAt: new Date() } },
      { new: true },
    );
    if (!request) return;
    try {
      if (request.role === ROLES.GYM_OWNER && request.ownerResolution) {
        await applyOwnerResolution(request);
      }
      await eraseUserData(request._id);
    } catch (err) {
      logger.error({ err, requestId: String(request._id) }, 'Account deletion processing failed; request will retry');
      await AccountDeletionRequest.updateOne({ _id: request._id, status: 'processing' }, { $unset: { processingAt: 1 } });
    }
  },

  async notifySupportReview(requestId: Types.ObjectId | string): Promise<void> {
    const request = await AccountDeletionRequest.findOne({
      _id: requestId,
      role: ROLES.GYM_OWNER,
      status: 'awaiting_support_review',
      supportNotifiedAt: { $exists: false },
    });
    if (!request?.user) return;
    const [user, gym] = await Promise.all([
      User.findById(request.user).select('name email'),
      Gym.findById(request.gym).select('name'),
    ]);
    if (!user || !gym) throw new Error('Verified gym-owner deletion request is missing its account or gym');

    await mailService.send(
      env.app.supportEmail,
      accountDeletionSupportReviewEmail({
        requestId: String(request._id),
        name: user.name,
        email: user.email,
        gymName: gym.name,
        reason: request.reason,
      }),
    );
    request.supportNotifiedAt = new Date();
    await request.save();
  },

  async retryPending(): Promise<void> {
    const pending = await AccountDeletionRequest.find({ status: 'processing' }).select('_id').limit(50);
    for (const request of pending) {
      await this.process(request._id);
    }

    const supportAlerts = await AccountDeletionRequest.find({
      status: 'awaiting_support_review',
      supportNotifiedAt: { $exists: false },
    })
      .select('_id')
      .limit(50);
    for (const request of supportAlerts) {
      try {
        await this.notifySupportReview(request._id);
      } catch (err) {
        logger.warn({ err, requestId: String(request._id) }, 'Account deletion support alert retry failed');
      }
    }

    const notificationRetries = await AccountDeletionRequest.find({
      status: 'completed',
      notificationEmail: { $exists: true, $ne: null },
    })
      .select('+notificationEmail')
      .limit(50);
    for (const request of notificationRetries) {
      if (!request.notificationEmail) continue;
      try {
        await mailService.send(request.notificationEmail, accountDeletionCompleteEmail());
        request.notificationEmail = undefined;
        await request.save();
      } catch (err) {
        logger.warn({ err, requestId: String(request._id) }, 'Account deletion completion email retry failed');
      }
    }
  },
};

export default accountDeletionService;
