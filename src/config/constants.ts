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
  ANNOUNCEMENT: 'announcement',
} as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

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
