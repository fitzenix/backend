import { membershipService } from '../modules/memberships/membership.service';
import { billingService } from '../modules/billing/billing.service';
import { Subscription } from '../modules/memberships/subscription.model';
import { notificationService } from '../modules/notifications/notification.service';
import { templateService } from '../modules/notifications/template.service';
import { SUBSCRIPTION_STATUS, PUSH_EVENTS } from '../config/constants';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { User } from '../modules/users/user.model';
import { Gym } from '../modules/gyms/gym.model';
import { mailService } from '../services/mail/mail.service';
import { paymentReminderEmail } from '../services/mail/templates';
import { getFirebaseApp } from '../firebase/admin';

/**
 * Lightweight in-process scheduler. For production scale, move these to a Redis
 * / BullMQ worker; the logic here is intentionally queue-agnostic so it can be
 * lifted out unchanged.
 */
const ONE_HOUR = 60 * 60 * 1000;
const FIVE_MIN = 5 * 60 * 1000;
const DAY_MS = 86_400_000;

const PRE_EXPIRY_DAYS = [3, 2, 1] as const;
const POST_EXPIRY_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Calendar days from today (start) until target date (start). */
function calendarDaysUntil(target: Date, from = new Date()): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(target).getTime();
  return Math.round((b - a) / DAY_MS);
}

/** Calendar days since target date (start) until today (start). */
function calendarDaysSince(target: Date, from = new Date()): number {
  return calendarDaysUntil(from, target);
}

function preExpiryTitle(daysLeft: number): string {
  if (daysLeft === 0) return 'Membership expires today';
  if (daysLeft === 1) return 'Membership expires tomorrow';
  return `Membership expires in ${daysLeft} days`;
}

function preExpiryBody(planName: string, daysLeft: number): string {
  const plan = planName || 'membership';
  if (daysLeft === 0) {
    return `Your ${plan} expires today. Renew now to keep uninterrupted gym access.`;
  }
  if (daysLeft === 1) {
    return `Your ${plan} expires tomorrow. Renew soon to avoid interruption.`;
  }
  return `Your ${plan} expires in ${daysLeft} days. Renew soon to keep your access active.`;
}

function postExpiryTitle(daysSince: number): string {
  if (daysSince === 7) return 'Final reminder — renew your membership';
  return 'Membership expired — please renew';
}

function postExpiryBody(planName: string, daysSince: number): string {
  const plan = planName || 'membership';
  if (daysSince === 7) {
    return `Your ${plan} expired a week ago. Renew today to restore full gym access.`;
  }
  return `Your ${plan} expired ${daysSince} day(s) ago. Please renew to restore access.`;
}

async function emailPaymentReminder(args: {
  memberId: unknown;
  gymId: unknown;
  planName: string;
  when: string;
  lapsed?: boolean;
}): Promise<void> {
  const [member, gym] = await Promise.all([
    User.findById(args.memberId).select('name email'),
    Gym.findById(args.gymId).select('name'),
  ]);
  if (!member?.email) return;
  await mailService.send(
    member.email,
    paymentReminderEmail({
      name: member.name,
      gymName: gym?.name ?? 'your gym',
      planName: args.planName,
      when: args.when,
      lapsed: args.lapsed,
    }),
  );
}

async function memberHasActiveSubscription(memberId: unknown, gymId: unknown): Promise<boolean> {
  const active = await Subscription.exists({
    member: memberId,
    gym: gymId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: new Date() },
  });
  return Boolean(active);
}

async function sendPreExpiryReminders(): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * DAY_MS);
  const subs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now, $lte: horizon },
  }).select('member gym endDate planSnapshot expiryRemindersSent');

  let sent = 0;
  for (const sub of subs) {
    const daysLeft = calendarDaysUntil(sub.endDate, now);
    if (!PRE_EXPIRY_DAYS.includes(daysLeft as (typeof PRE_EXPIRY_DAYS)[number])) continue;

    const milestone = `pre_${daysLeft}`;
    const sentKeys = sub.expiryRemindersSent ?? [];
    if (sentKeys.includes(milestone)) continue;

    const planName = sub.planSnapshot?.name ?? 'membership';
    // eslint-disable-next-line no-await-in-loop
    await notificationService.notify({
      gym: sub.gym,
      user: sub.member,
      type: 'membership',
      event: PUSH_EVENTS.MEMBER_MEMBERSHIP_EXPIRY,
      title: preExpiryTitle(daysLeft),
      body: preExpiryBody(planName, daysLeft),
      data: {
        subscriptionId: String(sub._id),
        daysRemaining: daysLeft,
        deepLink: 'Plan',
      },
      dedupeKey: `membership_expiry:${String(sub._id)}:${milestone}`,
    });
    const when =
      daysLeft === 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
    // eslint-disable-next-line no-await-in-loop
    await emailPaymentReminder({
      memberId: sub.member,
      gymId: sub.gym,
      planName,
      when,
    });

    sub.expiryRemindersSent = [...sentKeys, milestone];
    sub.lastExpiryReminderAt = new Date();
    // eslint-disable-next-line no-await-in-loop
    await sub.save();
    sent += 1;
  }
  return sent;
}

async function sendPostExpiryReminders(): Promise<number> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const subs = await Subscription.find({
    status: SUBSCRIPTION_STATUS.EXPIRED,
    endDate: { $gte: weekAgo, $lt: now },
  }).select('member gym endDate planSnapshot expiryRemindersSent');

  let sent = 0;
  for (const sub of subs) {
    const daysSince = calendarDaysSince(sub.endDate, now);
    if (!POST_EXPIRY_DAYS.includes(daysSince as (typeof POST_EXPIRY_DAYS)[number])) continue;

    const milestone = `post_${daysSince}`;
    const sentKeys = sub.expiryRemindersSent ?? [];
    if (sentKeys.includes(milestone)) continue;

    // eslint-disable-next-line no-await-in-loop
    const renewed = await memberHasActiveSubscription(sub.member, sub.gym);
    if (renewed) continue;

    const planName = sub.planSnapshot?.name ?? 'membership';
    // eslint-disable-next-line no-await-in-loop
    await notificationService.notify({
      gym: sub.gym,
      user: sub.member,
      type: 'membership',
      event: PUSH_EVENTS.MEMBER_MEMBERSHIP_LAPSED,
      title: postExpiryTitle(daysSince),
      body: postExpiryBody(planName, daysSince),
      data: {
        subscriptionId: String(sub._id),
        daysSinceExpiry: daysSince,
        deepLink: 'Plan',
      },
      dedupeKey: `membership_lapsed:${String(sub._id)}:${milestone}`,
    });
    // eslint-disable-next-line no-await-in-loop
    await emailPaymentReminder({
      memberId: sub.member,
      gymId: sub.gym,
      planName,
      when: `${daysSince} day(s) ago`,
      lapsed: true,
    });

    sub.expiryRemindersSent = [...sentKeys, milestone];
    sub.lastExpiryReminderAt = new Date();
    // eslint-disable-next-line no-await-in-loop
    await sub.save();
    sent += 1;
  }
  return sent;
}

/** Expire subscriptions past their end date and remind members nearing expiry. */
export async function runMembershipMaintenance(): Promise<void> {
  try {
    const { expired } = await membershipService.expireDue();
    if (expired) logger.info({ expired }, 'Expired due subscriptions');

    const gyms = await billingService.expireDue();
    if (gyms.expired) logger.info({ expired: gyms.expired }, 'Expired gym SaaS plans');

    const [preSent, postSent] = await Promise.all([
      sendPreExpiryReminders(),
      sendPostExpiryReminders(),
    ]);
    if (preSent || postSent) {
      logger.info({ preSent, postSent }, 'Membership expiry reminders sent');
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
