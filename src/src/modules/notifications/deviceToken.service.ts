import { Types } from 'mongoose';
import { DeviceToken, type DeviceTokenDocument, type DevicePlatform } from './deviceToken.model';
import { topicKeys } from './notification.utils';
import { fcmService } from '../../firebase/fcm.service';
import { ApiError } from '../../utils/ApiError';
import type { Role } from '../../config/constants';

export interface RegisterDeviceInput {
  userId: string;
  gymId?: string | null;
  role: Role;
  fcmToken: string;
  deviceId: string;
  platform: DevicePlatform;
  appVersion?: string;
  osVersion?: string;
}

export const deviceTokenService = {
  async register(input: RegisterDeviceInput): Promise<DeviceTokenDocument> {
    const topics = buildTopics(input.role, input.gymId);
    const filter = { user: input.userId, deviceId: input.deviceId };

    // Another user may have previously owned this FCM token — release it.
    await DeviceToken.updateMany(
      { fcmToken: input.fcmToken, user: { $ne: input.userId }, deletedAt: null },
      { $set: { status: 'inactive', deletedAt: new Date() } },
    );

    const existing = await DeviceToken.findOne({ ...filter, deletedAt: null });
    let doc: DeviceTokenDocument;

    if (existing) {
      const prevToken = existing.fcmToken;
      existing.fcmToken = input.fcmToken;
      existing.platform = input.platform;
      existing.appVersion = input.appVersion ?? existing.appVersion;
      existing.osVersion = input.osVersion ?? existing.osVersion;
      existing.gym = input.gymId ? new Types.ObjectId(input.gymId) : null;
      existing.topics = topics;
      existing.status = 'active';
      existing.lastActiveAt = new Date();
      existing.updatedBy = new Types.ObjectId(input.userId);
      existing.deletedAt = null;
      doc = await existing.save();

      if (prevToken !== input.fcmToken && prevToken) {
        await fcmService.unsubscribeTokensFromTopic([prevToken], topics[0] ?? topicKeys.role(input.role));
      }
    } else {
      doc = await DeviceToken.create({
        user: input.userId,
        gym: input.gymId ? new Types.ObjectId(input.gymId) : null,
        fcmToken: input.fcmToken,
        deviceId: input.deviceId,
        platform: input.platform,
        appVersion: input.appVersion ?? '',
        osVersion: input.osVersion ?? '',
        topics,
        lastActiveAt: new Date(),
        status: 'active',
        createdBy: new Types.ObjectId(input.userId),
        updatedBy: new Types.ObjectId(input.userId),
      });
    }

    for (const t of topics) {
      // eslint-disable-next-line no-await-in-loop
      await fcmService.subscribeTokensToTopic([doc.fcmToken], t);
    }

    return doc;
  },

  async touch(userId: string, deviceId: string): Promise<void> {
    await DeviceToken.updateOne(
      { user: userId, deviceId, deletedAt: null },
      { $set: { lastActiveAt: new Date(), status: 'active' } },
    );
  },

  async listActiveTokensForUser(userId: string): Promise<DeviceTokenDocument[]> {
    return DeviceToken.find({ user: userId, status: 'active', deletedAt: null });
  },

  async listActiveTokensForUsers(userIds: string[]): Promise<DeviceTokenDocument[]> {
    if (!userIds.length) return [];
    return DeviceToken.find({
      user: { $in: userIds },
      status: 'active',
      deletedAt: null,
    });
  },

  async deactivate(userId: string, deviceId?: string, fcmToken?: string): Promise<{ removed: number }> {
    const filter: Record<string, unknown> = { user: userId, deletedAt: null };
    if (deviceId) filter.deviceId = deviceId;
    if (fcmToken) filter.fcmToken = fcmToken;

    const tokens = await DeviceToken.find(filter);
    for (const t of tokens) {
      if (t.topics?.length) {
        for (const topic of t.topics) {
          // eslint-disable-next-line no-await-in-loop
          await fcmService.unsubscribeTokensFromTopic([t.fcmToken], topic);
        }
      }
      t.status = 'inactive';
      t.deletedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await t.save();
    }
    return { removed: tokens.length };
  },

  async markInvalid(fcmTokens: string[]): Promise<void> {
    if (!fcmTokens.length) return;
    await DeviceToken.updateMany(
      { fcmToken: { $in: fcmTokens } },
      { $set: { status: 'invalid', updatedAt: new Date() } },
    );
  },

  async getOrThrow(userId: string, id: string): Promise<DeviceTokenDocument> {
    const doc = await DeviceToken.findOne({ _id: id, user: userId, deletedAt: null });
    if (!doc) throw ApiError.notFound('Device token not found');
    return doc;
  },
};

function buildTopics(role: Role, gymId?: string | null): string[] {
  const topics = [topicKeys.role(role)];
  if (gymId) topics.push(topicKeys.gym(gymId));
  if (role === 'gym_owner') topics.push(topicKeys.owners());
  if (role === 'trainer' || role === 'staff') topics.push(topicKeys.trainers());
  if (role === 'member') topics.push(topicKeys.members());
  return [...new Set(topics)];
}

export default deviceTokenService;
