import { membershipService } from '../modules/memberships/membership.service';
import { Subscription } from '../modules/memberships/subscription.model';
import { notificationService } from '../modules/notifications/notification.service';
import { templateService } from '../modules/notifications/template.service';
import { SUBSCRIPTION_STATUS, PUSH_EVENTS } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { getFirebaseApp } from '../firebase/admin';

/**
 * Lightweight in-process scheduler. For production scale, move these to a Redis
 * / BullMQ worker; the logic here is intentionally queue-agnostic so it can be
 * lifted out unchanged.
 */
const ONE_HOUR = 60 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Expire subscriptions past their end date and remind members nearing expiry. */
export async function runMembershipMaintenance(): Promise<void> {
  try {
    const { expired } = await membershipService.expireDue();
    if (expired) logger.info({ expired }, 'Expired due subscriptions');

    const soon = new Date(Date.now() + 7 * DAY_MS);
    const dayAgo = new Date(Date.now() - 20 * ONE_HOUR);
    const expiring = await Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: new Date(), $lte: soon },
      $or: [{ lastExpiryReminderAt: null }, { lastExpiryReminderAt: { $lte: dayAgo } }],
    }).select('member gym endDate planSnapshot lastExpiryReminderAt');

    for (const sub of expiring) {
      const days = Math.ceil((sub.endDate.getTime() - Date.now()) / DAY_MS);
      // eslint-disable-next-line no-await-in-loop
      await notificationService.notify({
        gym: sub.gym,
        user: sub.member,
        type: 'membership',
        event: PUSH_EVENTS.MEMBER_MEMBERSHIP_EXPIRY,
        title: 'Membership expiring soon',
        body: `Your ${sub.planSnapshot?.name ?? 'membership'} expires in ${days} day(s). Renew to keep access.`,
        data: {
          subscriptionId: String(sub._id),
          daysRemaining: days,
          deepLink: 'Plan',
        },
        dedupeKey: `membership_expiry:${String(sub._id)}:${days}`,
      });
      sub.lastExpiryReminderAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await sub.save();
    }
  } catch (err) {
    logger.error({ err }, 'Membership maintenance job failed');
  }
}

/** Drain due scheduled push jobs (reminders, reports, birthday, etc.). */
export async function runNotificationQueue(): Promise<void> {
  try {
    const { processed, failed } = await notificationService.processQueue(100);
    if (processed || failed) {
      logger.info({ processed, failed }, 'Notification queue tick');
    }
  } catch (err) {
    logger.error({ err }, 'Notification queue job failed');
  }
}

let membershipTimer: NodeJS.Timeout | null = null;
let queueTimer: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (env.isTest) return;

  // Warm Firebase Admin (no-op when disabled)
  getFirebaseApp();
  void templateService.ensureDefaults().catch((err) =>
    logger.warn({ err }, 'Failed to seed notification templates'),
  );

  setTimeout(runMembershipMaintenance, 15_000).unref();
  membershipTimer = setInterval(runMembershipMaintenance, ONE_HOUR);
  membershipTimer.unref();

  setTimeout(runNotificationQueue, 20_000).unref();
  queueTimer = setInterval(runNotificationQueue, FIVE_MIN);
  queueTimer.unref();

  logger.info('Background scheduler started');
}

export function stopScheduler(): void {
  if (membershipTimer) clearInterval(membershipTimer);
  if (queueTimer) clearInterval(queueTimer);
}
