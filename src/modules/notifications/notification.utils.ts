import {
  NOTIFICATION_TYPES,
  PREFERENCE_KEYS,
  type NotificationType,
  type PreferenceKey,
  type PushEvent,
} from '../../config/constants';

/** Map notification type → preference toggle. Emergency always delivers. */
export function preferenceKeyForType(type: NotificationType): PreferenceKey | null {
  switch (type) {
    case NOTIFICATION_TYPES.WORKOUT:
      return PREFERENCE_KEYS.WORKOUT_REMINDER;
    case NOTIFICATION_TYPES.DIET:
      return PREFERENCE_KEYS.DIET_REMINDER;
    case NOTIFICATION_TYPES.MARKETING:
      return PREFERENCE_KEYS.MARKETING;
    case NOTIFICATION_TYPES.ANNOUNCEMENT:
      return PREFERENCE_KEYS.OFFERS;
    case NOTIFICATION_TYPES.ATTENDANCE:
      return PREFERENCE_KEYS.ATTENDANCE;
    case NOTIFICATION_TYPES.PAYMENT:
      return PREFERENCE_KEYS.PAYMENTS;
    case NOTIFICATION_TYPES.MEMBERSHIP:
      return PREFERENCE_KEYS.MEMBERSHIP;
    case NOTIFICATION_TYPES.CHAT:
      return PREFERENCE_KEYS.CHAT;
    case NOTIFICATION_TYPES.SYSTEM:
    case NOTIFICATION_TYPES.REPORT:
      return PREFERENCE_KEYS.SYSTEM_UPDATES;
    default:
      return PREFERENCE_KEYS.SYSTEM_UPDATES;
  }
}

/** Canonical deep-link screen keys consumed by the mobile navigator. */
export const DEEP_LINK_SCREENS = {
  FINANCE: 'Finance',
  ATTENDANCE: 'Attendance',
  WORKOUT: 'Workout',
  TRAINERS: 'Trainers',
  OFFER: 'ActivityFeed',
  PAYMENT_HISTORY: 'PaymentHistory',
  MEMBERSHIP: 'Plan',
  NOTIFICATIONS: 'Notifications',
  MEMBER_DETAIL: 'MemberDetail',
  DASHBOARD: 'Dashboard',
  EXPIRING: 'ExpiringSubscriptions',
  PENDING_PAYMENTS: 'PendingPayments',
} as const;

export type DeepLinkScreen = (typeof DEEP_LINK_SCREENS)[keyof typeof DEEP_LINK_SCREENS];

export function deepLinkForEvent(event?: string | PushEvent | null): DeepLinkScreen {
  if (!event) return DEEP_LINK_SCREENS.NOTIFICATIONS;
  if (event.includes('membership') || event.includes('expiry') || event.includes('renew')) {
    return DEEP_LINK_SCREENS.MEMBERSHIP;
  }
  if (event.includes('payment') || event.includes('revenue') || event.includes('expense')) {
    return DEEP_LINK_SCREENS.FINANCE;
  }
  if (event.includes('attendance') || event.includes('checkin') || event.includes('check_in')) {
    return DEEP_LINK_SCREENS.ATTENDANCE;
  }
  if (event.includes('workout') || event.includes('diet') || event.includes('water')) {
    return DEEP_LINK_SCREENS.WORKOUT;
  }
  if (event.includes('trainer')) return DEEP_LINK_SCREENS.TRAINERS;
  if (event.includes('offer') || event.includes('festival') || event.includes('holiday')) {
    return DEEP_LINK_SCREENS.OFFER;
  }
  return DEEP_LINK_SCREENS.NOTIFICATIONS;
}

/** Replace `{{var}}` placeholders in templates. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Topic key helpers for multi-tenant fan-out. */
export const topicKeys = {
  gym: (gymId: string) => `gym_${gymId}`,
  city: (city: string) => `city_${slug(city)}`,
  state: (state: string) => `state_${slug(state)}`,
  country: (country: string) => `country_${slug(country)}`,
  role: (role: string) => `role_${role}`,
  premium: () => 'plan_premium',
  trial: () => 'plan_trial',
  owners: () => 'role_gym_owner',
  trainers: () => 'role_trainer',
  members: () => 'role_member',
};

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function createDedupeKey(parts: Array<string | number | undefined | null>): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== '').join(':');
}
