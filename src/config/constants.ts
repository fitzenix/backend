/**
 * Shared domain enums / constants.
 *
 * Money is stored in INR **paise** (integer) everywhere to avoid float errors.
 * The API returns raw numbers; the client formats currency.
 *
 * Each enum is declared `as const` and paired with a derived union type so the
 * value objects and the TypeScript types stay in perfect sync (single source of
 * truth). `SET`s are exposed for O(1) membership checks.
 */

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  GYM_OWNER: 'gym_owner',
  TRAINER: 'trainer',
  STAFF: 'staff',
  MEMBER: 'member',
} as const;
export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ROLE_VALUES: readonly Role[] = Object.values(ROLES);
export const ROLE_SET: ReadonlySet<Role> = new Set(ROLE_VALUES);

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const GYM_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  TRIAL: 'trial',
} as const;
export type GymStatus = (typeof GYM_STATUS)[keyof typeof GYM_STATUS];

/** Fitzenix SaaS plans sold to gym owners (not member memberships). */
export const GYM_PLANS = {
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro',
} as const;
export type GymPlanId = (typeof GYM_PLANS)[keyof typeof GYM_PLANS];
export const GYM_PLAN_VALUES: readonly GymPlanId[] = Object.values(GYM_PLANS);

export const GYM_FEATURES = {
  MEMBERS: 'members',
  CHECKIN: 'checkin',
  ATTENDANCE: 'attendance',
  PAYMENTS: 'payments',
  REPORTS: 'reports',
  CRM: 'crm',
  APPS: 'apps',
  ANALYTICS: 'analytics',
  MULTI_STAFF: 'multi_staff',
  PRIORITY_SUPPORT: 'priority_support',
} as const;
export type GymFeature = (typeof GYM_FEATURES)[keyof typeof GYM_FEATURES];

export const TRIAL_DAYS = 14;
export const PLAN_PERIOD_DAYS = 30;

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

export const PAYMENT_STATUS = {
  CREATED: 'created',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/** `platform` = gym owner paying Fitzenix (SaaS). Never count as gym membership revenue. */
export const PAYMENT_PURPOSE = {
  SUBSCRIPTION: 'subscription',
  MANUAL: 'manual',
  PLATFORM: 'platform',
} as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSE)[keyof typeof PAYMENT_PURPOSE];

export const ATTENDANCE_STATUS = {
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const NOTIFICATION_TYPES = {
  SYSTEM: 'system',
  PAYMENT: 'payment',
  MEMBERSHIP: 'membership',
  CHAT: 'chat',
  WORKOUT: 'workout',
  DIET: 'diet',
  ATTENDANCE: 'attendance',
  ANNOUNCEMENT: 'announcement',
  MARKETING: 'marketing',
  REPORT: 'report',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Fine-grained push event keys used for templates, prefs, deep links, analytics. */
export const PUSH_EVENTS = {
  // Owner
  OWNER_NEW_MEMBER: 'owner.new_member',
  OWNER_MEMBERSHIP_EXPIRING: 'owner.membership_expiring',
  OWNER_PAYMENT_RECEIVED: 'owner.payment_received',
  OWNER_LOW_ATTENDANCE: 'owner.low_attendance',
  OWNER_TRAINER_ASSIGNED: 'owner.trainer_assigned',
  OWNER_TRAINER_REMOVED: 'owner.trainer_removed',
  OWNER_EXPENSE_ADDED: 'owner.expense_added',
  OWNER_REVENUE_SUMMARY: 'owner.revenue_summary',
  OWNER_DAILY_REPORT: 'owner.daily_report',
  OWNER_WEEKLY_REPORT: 'owner.weekly_report',
  OWNER_MONTHLY_REPORT: 'owner.monthly_report',
  // Trainer
  TRAINER_WORKOUT_ASSIGNED: 'trainer.workout_assigned',
  TRAINER_CLIENT_CHECKIN: 'trainer.client_checkin',
  TRAINER_WORKOUT_COMPLETED: 'trainer.workout_completed',
  TRAINER_DIET_UPDATED: 'trainer.diet_updated',
  TRAINER_MEMBER_MESSAGE: 'trainer.member_message',
  TRAINER_NEW_SCHEDULE: 'trainer.new_schedule',
  // Member
  MEMBER_WELCOME: 'member.welcome',
  MEMBER_MEMBERSHIP_EXPIRY: 'member.membership_expiry',
  MEMBER_MEMBERSHIP_LAPSED: 'member.membership_lapsed',
  MEMBER_MEMBERSHIP_RENEWED: 'member.membership_renewed',
  MEMBER_PAYMENT_SUCCESS: 'member.payment_success',
  MEMBER_WORKOUT_REMINDER: 'member.workout_reminder',
  MEMBER_DIET_REMINDER: 'member.diet_reminder',
  MEMBER_WATER_REMINDER: 'member.water_reminder',
  MEMBER_ATTENDANCE_MARKED: 'member.attendance_marked',
  MEMBER_BMI_UPDATED: 'member.bmi_updated',
  MEMBER_MEASUREMENT_UPDATED: 'member.measurement_updated',
  MEMBER_NEW_OFFER: 'member.new_offer',
  MEMBER_GYM_HOLIDAY: 'member.gym_holiday',
  MEMBER_FESTIVAL_WISHES: 'member.festival_wishes',
  MEMBER_CHECKIN_REMINDER: 'member.checkin_reminder',
  MEMBER_BIRTHDAY: 'member.birthday',
  // Super admin
  SA_NEW_GYM: 'sa.new_gym',
  SA_SUBSCRIPTION_PURCHASED: 'sa.subscription_purchased',
  SA_SUBSCRIPTION_EXPIRED: 'sa.subscription_expired',
  SA_FAILED_PAYMENT: 'sa.failed_payment',
  SA_TRIAL_ENDING: 'sa.trial_ending',
  SA_SERVER_ALERT: 'sa.server_alert',
  SA_BACKUP_COMPLETED: 'sa.backup_completed',
  SA_BACKUP_FAILED: 'sa.backup_failed',
} as const;
export type PushEvent = (typeof PUSH_EVENTS)[keyof typeof PUSH_EVENTS];

export const PREFERENCE_KEYS = {
  WORKOUT_REMINDER: 'workoutReminder',
  DIET_REMINDER: 'dietReminder',
  MARKETING: 'marketing',
  OFFERS: 'offers',
  ATTENDANCE: 'attendance',
  PAYMENTS: 'payments',
  MEMBERSHIP: 'membership',
  SYSTEM_UPDATES: 'systemUpdates',
  EMERGENCY_ALERTS: 'emergencyAlerts',
  CHAT: 'chat',
} as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

export const CURRENCY = 'INR' as const;

export const EXPENSE_CATEGORIES = {
  SALARIES: 'salaries',
  RENT: 'rent',
  UTILITIES: 'utilities',
  EQUIPMENT: 'equipment',
  MARKETING: 'marketing',
  MAINTENANCE: 'maintenance',
  OTHER: 'other',
} as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[keyof typeof EXPENSE_CATEGORIES];

export const INVOICE_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  VOID: 'void',
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const ENQUIRY_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  CONVERTED: 'converted',
  LOST: 'lost',
} as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUS)[keyof typeof ENQUIRY_STATUS];
