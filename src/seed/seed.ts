import mongoose, { type Model } from 'mongoose';
import { connectDB, disconnectDB } from '../config/db';
import { logger } from '../config/logger';
import { ROLES, USER_STATUS, GYM_STATUS, SUBSCRIPTION_STATUS, PAYMENT_STATUS } from '../config/constants';
import { User, type IUser, type UserDocument } from '../modules/users/user.model';
import { Gym } from '../modules/gyms/gym.model';
import { MembershipPlan, type MembershipPlanDocument } from '../modules/memberships/membershipPlan.model';
import { Subscription } from '../modules/memberships/subscription.model';
import { Payment } from '../modules/payments/payment.model';
import { Invoice } from '../modules/payments/invoice.model';
import { Attendance } from '../modules/attendance/attendance.model';
import { WorkoutPlan } from '../modules/fitness/workoutPlan.model';
import { DietPlan } from '../modules/fitness/dietPlan.model';
import { ProgressLog } from '../modules/fitness/progressLog.model';
import { DefaultWeeklyWorkout } from '../modules/fitness/defaultWeeklyWorkout.model';
import { fitnessService } from '../modules/fitness/fitness.service';
import { Post } from '../modules/feed/post.model';
import { Notification } from '../modules/notifications/notification.model';
import { numericId } from '../utils/ids';

const addDays = (d: Date, days: number): Date => new Date(new Date(d).setDate(new Date(d).getDate() + days));

/** Create a user with a hashed password (mirrors the model's setPassword flow). */
async function createUser(data: Partial<IUser> & { password: string }): Promise<UserDocument> {
  const { password, ...rest } = data;
  const user = new User({ ...rest, passwordHash: 'pending' });
  await user.setPassword(password);
  await user.save();
  return user;
}

async function clearAll(): Promise<void> {
  const models: Model<unknown>[] = [
    User,
    Gym,
    MembershipPlan,
    Subscription,
    Payment,
    Invoice,
    Attendance,
    WorkoutPlan,
    DietPlan,
    ProgressLog,
    DefaultWeeklyWorkout,
    Post,
    Notification,
  ] as unknown as Model<unknown>[];
  await Promise.all(models.map((m) => m.deleteMany({})));
}

async function seed(): Promise<void> {
  await connectDB();
  logger.info('Clearing existing data...');
  await clearAll();

  // ── Default weekly workouts (no-trainer members) ─────
  await fitnessService.seedDefaultWeekly();
  logger.info('Seeded default weekly workout rotations (4 weeks × 7 days)');

  // ── Super admin ──────────────────────────────────────
  await createUser({
    name: 'Platform Admin',
    email: 'admin@fitzenix.com',
    password: 'Admin@12345',
    role: ROLES.SUPER_ADMIN,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });

  // ── Gym + owner ──────────────────────────────────────
  const owner = await createUser({
    name: 'Ravi Kumar',
    email: 'owner@ironforge.com',
    password: 'Owner@12345',
    role: ROLES.GYM_OWNER,
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
  });
  const gym = await Gym.create({
    name: 'Iron Forge Fitness',
    slug: 'iron-forge-fitness',
    owner: owner._id,
    email: 'hello@ironforge.com',
    phone: '+919876543210',
    status: GYM_STATUS.ACTIVE,
    plan: 'pro',
    planPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    planPaidAt: new Date(),
    address: { line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    branding: { primaryColor: '#E17055', tagline: 'Forge your best self' },
  });
  owner.gym = gym._id;
  await owner.save();

  // ── Trainer ──────────────────────────────────────────
  const trainer = await createUser({
    name: 'Anita Sharma',
    email: 'anita@ironforge.com',
    password: 'Trainer@123',
    role: ROLES.TRAINER,
    gym: gym._id,
    status: USER_STATUS.ACTIVE,
    trainerProfile: {
      specialties: ['Strength', 'HIIT'],
      bio: 'NASM-certified strength coach.',
      experienceYears: 6,
      certifications: ['NASM-CPT'],
      hourlyRatePaise: 80000,
      rating: 4.8,
    },
  });

  // ── Membership plans ─────────────────────────────────
  const [monthly, quarterly, yearly] = await MembershipPlan.create([
    {
      gym: gym._id,
      name: 'Monthly',
      durationDays: 30,
      pricePaise: 150000,
      features: ['Gym Access — All Branches', 'Locker — Available', 'Group Classes — Basic'],
    },
    {
      gym: gym._id,
      name: 'Quarterly',
      durationDays: 90,
      pricePaise: 400000,
      features: [
        'Gym Access — All Branches',
        'Group Classes — Unlimited',
        'Personal Training — 1 Session / Month',
        'Locker — Available',
      ],
      trainerIncluded: true,
    },
    {
      gym: gym._id,
      name: 'Annual',
      description: 'Full access annual membership',
      durationDays: 365,
      pricePaise: 1200000,
      features: [
        'Gym Access — All Branches',
        'Group Classes — Unlimited',
        'Personal Training — 2 Sessions / Month',
        'Diet Plan — Customized',
        'Locker — Available',
      ],
      trainerIncluded: true,
    },
  ]);

  // ── Members + subscriptions + payments ───────────────
  const memberSpecs: Array<{ name: string; email: string; plan: MembershipPlanDocument }> = [
    { name: 'Vikram Singh', email: 'vikram@example.com', plan: quarterly },
    { name: 'Priya Nair', email: 'priya@example.com', plan: monthly },
    { name: 'Arjun Mehta', email: 'arjun@example.com', plan: yearly },
  ];

  for (const spec of memberSpecs) {
    // eslint-disable-next-line no-await-in-loop
    const member = await createUser({
      name: spec.name,
      email: spec.email,
      password: 'Member@123',
      role: ROLES.MEMBER,
      gym: gym._id,
      status: USER_STATUS.ACTIVE,
      memberProfile: {
        gender: 'male',
        heightCm: 175,
        weightKg: 78,
        goals: ['Fat loss', 'Strength'],
        assignedTrainer: trainer._id,
      },
    });

    const start = new Date();
    // eslint-disable-next-line no-await-in-loop
    const sub = await Subscription.create({
      gym: gym._id,
      member: member._id,
      plan: spec.plan._id,
      planSnapshot: {
        name: spec.plan.name,
        durationDays: spec.plan.durationDays,
        pricePaise: spec.plan.pricePaise,
        features: spec.plan.features ?? [],
      },
      startDate: start,
      endDate: addDays(start, spec.plan.durationDays),
      status: SUBSCRIPTION_STATUS.ACTIVE,
    });

    // eslint-disable-next-line no-await-in-loop
    const payment = await Payment.create({
      gym: gym._id,
      member: member._id,
      subscription: sub._id,
      provider: 'mock',
      orderId: `order_seed_${member._id}`,
      paymentId: `pay_seed_${member._id}`,
      amountPaise: spec.plan.pricePaise,
      status: PAYMENT_STATUS.PAID,
      purpose: 'subscription',
      paidAt: new Date(),
    });
    sub.payment = payment._id;
    // eslint-disable-next-line no-await-in-loop
    await sub.save();

    // eslint-disable-next-line no-await-in-loop
    await Invoice.create({
      gym: gym._id,
      member: member._id,
      payment: payment._id,
      number: `INV-${new Date().getFullYear()}-${numericId(8)}`,
      items: [
        { description: `Membership: ${spec.plan.name}`, quantity: 1, unitPricePaise: spec.plan.pricePaise, amountPaise: spec.plan.pricePaise },
      ],
      subtotalPaise: spec.plan.pricePaise,
      totalPaise: spec.plan.pricePaise,
      status: 'paid',
    });

    // eslint-disable-next-line no-await-in-loop
    await WorkoutPlan.create({
      gym: gym._id,
      member: member._id,
      trainer: trainer._id,
      title: 'Beginner Strength — 3 day split',
      days: [
        {
          day: 'Day 1',
          focus: 'Push',
          exercises: [
            { name: 'Bench Press', sets: 4, reps: '8-10', restSeconds: 90 },
            { name: 'Overhead Press', sets: 3, reps: '10', restSeconds: 60 },
          ],
        },
        { day: 'Day 2', focus: 'Pull', exercises: [{ name: 'Deadlift', sets: 4, reps: '5', restSeconds: 120 }] },
      ],
    });

    // eslint-disable-next-line no-await-in-loop
    await DietPlan.create({
      gym: gym._id,
      member: member._id,
      trainer: trainer._id,
      title: '2200 kcal cut',
      targetCalories: 2200,
      meals: [
        { name: 'Breakfast', time: '08:00', items: [{ food: 'Oats + whey', quantity: '80g', calories: 450, protein: 35 }] },
      ],
    });

    // Attendance history (last 5 days)
    for (let i = 1; i <= 5; i += 1) {
      const checkIn = addDays(new Date(), -i);
      // eslint-disable-next-line no-await-in-loop
      await Attendance.create({
        gym: gym._id,
        member: member._id,
        checkInAt: checkIn,
        checkOutAt: new Date(checkIn.getTime() + 60 * 60000),
        status: 'checked_out',
        durationMinutes: 60,
        source: 'self',
        recordedBy: member._id,
      });
    }

    // Progress history (last 14 days) for charts
    const baseW = 78 + (spec.name.length % 4);
    const baseFat = 18.5;
    for (let i = 13; i >= 0; i -= 1) {
      if (i % 2 === 1) continue; // every other day
      const day = addDays(new Date(), -i);
      const progress = (13 - i) / 13;
      // eslint-disable-next-line no-await-in-loop
      await ProgressLog.create({
        gym: gym._id,
        member: member._id,
        recordedBy: trainer._id,
        date: day,
        weightKg: Math.round((baseW - progress * 2.5) * 10) / 10,
        bodyFatPct: Math.round((baseFat - progress * 1.8) * 10) / 10,
        notes: i === 0 ? 'Latest check-in' : '',
      });
    }
  }

  // ── Feed ─────────────────────────────────────────────
  await Post.create({
    gym: gym._id,
    author: owner._id,
    content: 'Welcome to Iron Forge! New squat racks arriving this week.',
    isAnnouncement: true,
  });

  logger.info('Seed complete. Login credentials:');
  logger.info('  super_admin  admin@fitzenix.com / Admin@12345');
  logger.info('  gym_owner    owner@ironforge.com / Owner@12345');
  logger.info('  trainer      anita@ironforge.com / Trainer@123');
  logger.info('  member       vikram@example.com / Member@123');

  await disconnectDB();
  await mongoose.connection.close();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
  });
