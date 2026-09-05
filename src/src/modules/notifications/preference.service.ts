import { Types } from 'mongoose';
import {
  NotificationPreferences,
  DEFAULT_PREFERENCES,
  type INotificationPreferences,
  type NotificationPreferencesDocument,
} from './notificationPreference.model';
import { preferenceKeyForType } from './notification.utils';
import type { NotificationType, PreferenceKey } from '../../config/constants';
import type { Ctx } from '../../types/index';

export const preferenceService = {
  async getOrCreate(userId: string, gymId?: string | null): Promise<NotificationPreferencesDocument> {
    let prefs = await NotificationPreferences.findOne({ user: userId, deletedAt: null });
    if (!prefs) {
      prefs = await NotificationPreferences.create({
        user: userId,
        gym: gymId ? new Types.ObjectId(gymId) : null,
        ...DEFAULT_PREFERENCES,
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
      });
    }
    return prefs;
  },

  async getForCtx(ctx: Ctx): Promise<NotificationPreferencesDocument> {
    return this.getOrCreate(String(ctx.user._id), ctx.user.gym ? String(ctx.user.gym) : null);
  },

  async update(
    ctx: Ctx,
    patch: Partial<Record<PreferenceKey, boolean>> & {
      quietHours?: { enabled?: boolean; start?: string; end?: string };
    },
  ): Promise<NotificationPreferencesDocument> {
    const prefs = await this.getForCtx(ctx);
    const keys = Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[];
    for (const key of keys) {
      if (typeof patch[key] === 'boolean') {
        (prefs as unknown as Record<string, boolean>)[key] = patch[key] as boolean;
      }
    }
    if (patch.quietHours) {
      prefs.quietHours = {
        enabled: patch.quietHours.enabled ?? prefs.quietHours?.enabled ?? false,
        start: patch.quietHours.start ?? prefs.quietHours?.start ?? '22:00',
        end: patch.quietHours.end ?? prefs.quietHours?.end ?? '07:00',
      };
    }
    prefs.updatedBy = ctx.user._id;
    await prefs.save();
    return prefs;
  },

  /** Returns false when the user has disabled this category (except emergency). */
  async allows(userId: string, type: NotificationType, force = false): Promise<boolean> {
    if (force) return true;
    const key = preferenceKeyForType(type);
    if (!key) return true;
    if (key === 'emergencyAlerts') return true;

    const prefs = await NotificationPreferences.findOne({ user: userId, deletedAt: null }).lean();
    if (!prefs) return (DEFAULT_PREFERENCES[key as PreferenceKey] ?? true);

    // Quiet hours — suppress non-emergency
    if (prefs.quietHours?.enabled && isInQuietHours(prefs.quietHours.start, prefs.quietHours.end)) {
      return false;
    }

    return Boolean((prefs as unknown as Record<PreferenceKey, boolean>)[key]);
  },

  toPublic(prefs: INotificationPreferences | NotificationPreferencesDocument) {
    return {
      workoutReminder: prefs.workoutReminder,
      dietReminder: prefs.dietReminder,
      marketing: prefs.marketing,
      offers: prefs.offers,
      attendance: prefs.attendance,
      payments: prefs.payments,
      membership: prefs.membership,
      systemUpdates: prefs.systemUpdates,
      emergencyAlerts: prefs.emergencyAlerts,
      chat: prefs.chat,
      quietHours: prefs.quietHours,
    };
  },
};

function isInQuietHours(start = '22:00', end = '07:00'): boolean {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  if (startM === endM) return false;
  if (startM < endM) return mins >= startM && mins < endM;
  // wraps midnight
  return mins >= startM || mins < endM;
}

export default preferenceService;
