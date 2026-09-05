import { NotificationTemplate } from './notificationTemplate.model';
import { renderTemplate } from './notification.utils';
import { NOTIFICATION_TYPES, PUSH_EVENTS } from '../../config/constants';
import { logger } from '../../config/logger';

const DEFAULT_TEMPLATES = [
  {
    key: 'member.welcome',
    event: PUSH_EVENTS.MEMBER_WELCOME,
    type: NOTIFICATION_TYPES.SYSTEM,
    title: 'Welcome to {{gymName}}!',
    body: 'Hi {{memberName}}, your membership is active. Let’s crush your goals.',
    deepLink: 'Plan',
    variables: ['memberName', 'gymName'],
  },
  {
    key: 'member.membership_expiry',
    event: PUSH_EVENTS.MEMBER_MEMBERSHIP_EXPIRY,
    type: NOTIFICATION_TYPES.MEMBERSHIP,
    title: 'Membership expiring soon',
    body: 'Hello {{memberName}}, your membership expires in {{days}} days.',
    deepLink: 'Plan',
    variables: ['memberName', 'days'],
  },
  {
    key: 'member.membership_lapsed',
    event: PUSH_EVENTS.MEMBER_MEMBERSHIP_LAPSED,
    type: NOTIFICATION_TYPES.MEMBERSHIP,
    title: 'Membership expired — renew now',
    body: 'Hi {{memberName}}, your membership expired {{days}} day(s) ago. Renew to restore access.',
    deepLink: 'Plan',
    variables: ['memberName', 'days'],
  },
  {
    key: 'member.payment_success',
    event: PUSH_EVENTS.MEMBER_PAYMENT_SUCCESS,
    type: NOTIFICATION_TYPES.PAYMENT,
    title: 'Payment successful',
    body: 'Payment of ₹{{amount}} received. Thank you!',
    deepLink: 'PaymentHistory',
    variables: ['amount'],
  },
  {
    key: 'owner.payment_received',
    event: PUSH_EVENTS.OWNER_PAYMENT_RECEIVED,
    type: NOTIFICATION_TYPES.PAYMENT,
    title: 'Payment received',
    body: '{{memberName}} paid ₹{{amount}}.',
    deepLink: 'Finance',
    variables: ['memberName', 'amount'],
  },
  {
    key: 'owner.new_member',
    event: PUSH_EVENTS.OWNER_NEW_MEMBER,
    type: NOTIFICATION_TYPES.SYSTEM,
    title: 'New member joined',
    body: '{{memberName}} just joined {{gymName}}.',
    deepLink: 'Members',
    variables: ['memberName', 'gymName'],
  },
  {
    key: 'member.workout_reminder',
    event: PUSH_EVENTS.MEMBER_WORKOUT_REMINDER,
    type: NOTIFICATION_TYPES.WORKOUT,
    title: 'Time to train 💪',
    body: 'Your {{workoutName}} session is waiting. Let’s go!',
    deepLink: 'Workout',
    variables: ['workoutName'],
  },
  {
    key: 'member.water_reminder',
    event: PUSH_EVENTS.MEMBER_WATER_REMINDER,
    type: NOTIFICATION_TYPES.DIET,
    title: 'Hydration check',
    body: 'Drink a glass of water to stay on track.',
    deepLink: 'Workout',
    variables: [],
  },
  {
    key: 'member.attendance_marked',
    event: PUSH_EVENTS.MEMBER_ATTENDANCE_MARKED,
    type: NOTIFICATION_TYPES.ATTENDANCE,
    title: 'Check-in recorded',
    body: 'You’re checked in. Have a great workout!',
    deepLink: 'MemberAttendance',
    variables: [],
  },
  {
    key: 'sa.new_gym',
    event: PUSH_EVENTS.SA_NEW_GYM,
    type: NOTIFICATION_TYPES.SYSTEM,
    title: 'New gym registered',
    body: '{{gymName}} just signed up on Fitzenix.',
    deepLink: 'Gyms',
    variables: ['gymName'],
  },
] as const;

export const templateService = {
  async ensureDefaults(): Promise<void> {
    for (const t of DEFAULT_TEMPLATES) {
      // eslint-disable-next-line no-await-in-loop
      await NotificationTemplate.updateOne(
        { key: t.key },
        {
          $setOnInsert: {
            ...t,
            locale: 'en',
            status: 'active',
          },
        },
        { upsert: true },
      );
    }
    logger.info({ count: DEFAULT_TEMPLATES.length }, 'Notification templates ensured');
  },

  async render(
    keyOrEvent: string,
    vars: Record<string, string | number | null | undefined>,
  ): Promise<{ title: string; body: string; deepLink?: string; type: string; event: string } | null> {
    const tpl =
      (await NotificationTemplate.findOne({ key: keyOrEvent, status: 'active', deletedAt: null })) ||
      (await NotificationTemplate.findOne({ event: keyOrEvent, status: 'active', deletedAt: null }));
    if (!tpl) return null;
    return {
      title: renderTemplate(tpl.title, vars),
      body: renderTemplate(tpl.body, vars),
      deepLink: tpl.deepLink,
      type: tpl.type,
      event: tpl.event,
    };
  },
};

export default templateService;
