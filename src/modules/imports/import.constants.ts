export const IMPORT_DEFAULT_PASSWORD = 'Fitzenix@1234';
export const IMPORT_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const IMPORT_MAX_PLANS = 50;
export const IMPORT_MAX_TRAINERS = 200;
export const IMPORT_MAX_MEMBERS = 500;

export const SPREADSHEET_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export const PLAN_HEADERS = [
  'name',
  'duration_days',
  'price_rupees',
  'description',
  'trainer_included',
  'features',
] as const;

export const TRAINER_HEADERS = [
  'name',
  'email',
  'phone',
  'password',
  'specialties',
] as const;

export const MEMBER_HEADERS = [
  'name',
  'email',
  'phone',
  'password',
  'plan_name',
  'trainer_email',
  'start_date',
  'mark_paid',
  'allow_two_sessions',
] as const;

export const SAMPLE_PLANS = [
  {
    name: 'Gold Monthly',
    duration_days: '30',
    price_rupees: '1999',
    description: 'Full gym access for 1 month',
    trainer_included: 'false',
    features: 'Gym access | Cardio | Locker',
  },
  {
    name: 'Platinum Quarterly',
    duration_days: '90',
    price_rupees: '4999',
    description: 'Full gym access for 3 months',
    trainer_included: 'true',
    features: 'Gym access | Personal trainer | Diet consult',
  },
];

export const SAMPLE_TRAINERS = [
  {
    name: 'Rahul Sharma',
    email: 'rahul.trainer@example.com',
    phone: '9876543210',
    password: '',
    specialties: 'Strength | Weight loss',
  },
];

export const SAMPLE_MEMBERS = [
  {
    name: 'Arjun Mehta',
    email: 'arjun.member@example.com',
    phone: '9123456780',
    password: '',
    plan_name: 'Gold Monthly',
    trainer_email: 'rahul.trainer@example.com',
    start_date: '2026-01-01',
    mark_paid: 'true',
    allow_two_sessions: 'false',
  },
  {
    name: 'Priya Singh',
    email: 'priya.member@example.com',
    phone: '9988776655',
    password: '',
    plan_name: 'Platinum Quarterly',
    trainer_email: '',
    start_date: '',
    mark_paid: 'true',
    allow_two_sessions: 'true',
  },
];
