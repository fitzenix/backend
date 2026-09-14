import { Types, type PipelineStage } from 'mongoose';
import { User } from '../users/user.model';
import { Gym } from '../gyms/gym.model';
import { Subscription } from '../memberships/subscription.model';
import { Payment } from '../payments/payment.model';
import { Invoice } from '../payments/invoice.model';
import { Attendance } from '../attendance/attendance.model';
import { WorkoutPlan } from '../fitness/workoutPlan.model';
import { DietPlan } from '../fitness/dietPlan.model';
import { Enquiry } from '../enquiries/enquiry.model';
import {
  ROLES,
  GYM_STATUS,
  SUBSCRIPTION_STATUS,
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  INVOICE_STATUS,
  ENQUIRY_STATUS,
  ATTENDANCE_STATUS,
} from '../../config/constants';
import type { Ctx } from '../../types/index';
import type { WorkoutDay } from '../fitness/workoutPlan.model';

const DAY_MS = 86_400_000;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const startOfMonth = (d = new Date()): Date => new Date(d.getFullYear(), d.getMonth(), 1);
const startOfDay = (d = new Date()): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfPrevMonth = (d = new Date()): Date => new Date(d.getFullYear(), d.getMonth() - 1, 1);
const endOfPrevMonth = (d = new Date()): Date => new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);

/** Match a workout-plan day to today (weekday name, or rotate by Mon-based index). */
function matchWorkoutDay(
  planDays: WorkoutDay[],
  weekday: number,
  mondayIndex: number,
): WorkoutDay | null {
  if (!planDays.length) return null;
  const name = WEEKDAY_NAMES[weekday].toLowerCase();
  const short = DOW[weekday].toLowerCase();
  const byName = planDays.find((d) => {
    const label = (d.day || '').toLowerCase();
    return label.includes(name) || label === short || label.startsWith(name.slice(0, 3));
  });
  if (byName) return byName;
  return planDays[mondayIndex % planDays.length];
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

async function sumPaid(
  match: Record<string, unknown>,
  includePlatform = false,
): Promise<{ totalPaise: number; count: number }> {
  const [row] = await Payment.aggregate<{ total: number; count: number }>([
    {
      $match: {
        status: PAYMENT_STATUS.PAID,
        ...(includePlatform
          ? {}
          : {
              purpose: { $ne: PAYMENT_PURPOSE.PLATFORM },
              'notes.purpose': { $ne: PAYMENT_PURPOSE.PLATFORM },
            }),
        ...match,
      },
    },
    { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
  ]);
  return { totalPaise: row?.total ?? 0, count: row?.count ?? 0 };
}

export const reportsService = {
  /** Platform-wide dashboard for super_admin. */
  async platform() {
    const monthStart = startOfMonth();
    const prevMonthStart = startOfPrevMonth();
    const prevMonthEnd = endOfPrevMonth();

    const [
      totalGyms,
      activeGyms,
      trialGyms,
      gymsThisMonth,
      gymsPrevMonth,
      totalUsers,
      usersThisMonth,
      usersPrevMonth,
      trainers,
      trainersThisMonth,
      trainersPrevMonth,
      revenue,
      monthRevenue,
      prevMonthRevenue,
      activeSubs,
      attendanceToday,
      usersByRole,
    ] = await Promise.all([
      Gym.countDocuments({ deletedAt: null }),
      Gym.countDocuments({ deletedAt: null, status: GYM_STATUS.ACTIVE }),
      Gym.countDocuments({ deletedAt: null, status: GYM_STATUS.TRIAL }),
      Gym.countDocuments({ deletedAt: null, createdAt: { $gte: monthStart } }),
      Gym.countDocuments({ deletedAt: null, createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } }),
      User.countDocuments({ deletedAt: null }),
      User.countDocuments({ deletedAt: null, createdAt: { $gte: monthStart } }),
      User.countDocuments({ deletedAt: null, createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd } }),
      User.countDocuments({ deletedAt: null, role: ROLES.TRAINER }),
      User.countDocuments({ deletedAt: null, role: ROLES.TRAINER, createdAt: { $gte: monthStart } }),
      User.countDocuments({
        deletedAt: null,
        role: ROLES.TRAINER,
        createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd },
      }),
      sumPaid({}, true),
      sumPaid({ paidAt: { $gte: monthStart } }, true),
      sumPaid({ paidAt: { $gte: prevMonthStart, $lte: prevMonthEnd } }, true),
      Subscription.countDocuments({
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date() },
      }),
      Attendance.countDocuments({ checkInAt: { $gte: startOfDay() } }),
      User.aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
    ]);

    const pct = (curr: number, prev: number): number | null =>
      prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : null;

    return {
      gyms: { total: totalGyms, active: activeGyms, trial: trialGyms },
      users: {
        total: totalUsers,
        byRole: Object.fromEntries(usersByRole.map((r) => [r._id, r.count])),
      },
      trainers,
      revenue: { allTimePaise: revenue.totalPaise, thisMonthPaise: monthRevenue.totalPaise },
      subscriptions: { active: activeSubs },
      attendance: { today: attendanceToday },
      deltas: {
        gymsPct: pct(gymsThisMonth, gymsPrevMonth),
        usersPct: pct(usersThisMonth, usersPrevMonth),
        revenuePct: pct(monthRevenue.totalPaise, prevMonthRevenue.totalPaise),
        trainersPct: pct(trainersThisMonth, trainersPrevMonth),
      },
    };
  },

  /** Monthly user growth series (owners / trainers / members) for super_admin analytics. */
  async userGrowth({ months = 6 }: { months?: number }) {
    const from = startOfMonth(new Date(new Date().setMonth(new Date().getMonth() - (months - 1))));
    const roles = [ROLES.GYM_OWNER, ROLES.TRAINER, ROLES.MEMBER];
    const rows = await User.aggregate<{
      _id: { y: number; m: number; role: string };
      count: number;
    }>([
      {
        $match: {
          deletedAt: null,
          role: { $in: roles },
          createdAt: { $gte: from },
        },
      },
      {
        $group: {
          _id: {
            y: { $year: '$createdAt' },
            m: { $month: '$createdAt' },
            role: '$role',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]);

    const byMonth = new Map<string, { year: number; month: number; owners: number; trainers: number; members: number }>();
    for (let i = 0; i < months; i += 1) {
      const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      byMonth.set(key, {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        owners: 0,
        trainers: 0,
        members: 0,
      });
    }
    for (const r of rows) {
      const key = `${r._id.y}-${r._id.m}`;
      const bucket = byMonth.get(key);
      if (!bucket) continue;
      if (r._id.role === ROLES.GYM_OWNER) bucket.owners = r.count;
      else if (r._id.role === ROLES.TRAINER) bucket.trainers = r.count;
      else if (r._id.role === ROLES.MEMBER) bucket.members = r.count;
    }
    return [...byMonth.values()];
  },

  /** Gym dashboard for gym_owner / super_admin (scoped by gymId). */
  async gym(gymId: string) {
    const gymOid = new Types.ObjectId(gymId);
    const gymMatch = { gym: gymOid };
    const today = startOfDay();
    const monthStart = startOfMonth();
    const prevMonthStart = startOfPrevMonth();
    const prevMonthEnd = endOfPrevMonth();
    const in3Days = new Date(Date.now() + 3 * DAY_MS);
    const in7Days = new Date(Date.now() + 7 * DAY_MS);

    const [
      members,
      trainers,
      activeSubs,
      expiringSubs,
      expiringIn3Days,
      checkedInToday,
      revenue,
      monthRevenue,
      prevMonthRevenue,
      newMembersToday,
      newMembersThisMonth,
      newMembersPrevMonth,
      openEnquiries,
      unpaidInvoices,
      unpaidActiveSubs,
    ] = await Promise.all([
      User.countDocuments({ ...gymMatch, role: ROLES.MEMBER, deletedAt: null }),
      User.countDocuments({ ...gymMatch, role: ROLES.TRAINER, deletedAt: null }),
      Subscription.countDocuments({
        ...gymMatch,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date() },
      }),
      Subscription.countDocuments({
        ...gymMatch,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date(), $lte: in7Days },
      }),
      Subscription.countDocuments({
        ...gymMatch,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date(), $lte: in3Days },
      }),
      Attendance.countDocuments({ ...gymMatch, checkInAt: { $gte: today } }),
      sumPaid(gymMatch),
      sumPaid({ ...gymMatch, paidAt: { $gte: monthStart } }),
      sumPaid({ ...gymMatch, paidAt: { $gte: prevMonthStart, $lte: prevMonthEnd } }),
      User.countDocuments({
        ...gymMatch,
        role: ROLES.MEMBER,
        deletedAt: null,
        createdAt: { $gte: today },
      }),
      User.countDocuments({
        ...gymMatch,
        role: ROLES.MEMBER,
        deletedAt: null,
        createdAt: { $gte: monthStart },
      }),
      User.countDocuments({
        ...gymMatch,
        role: ROLES.MEMBER,
        deletedAt: null,
        createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd },
      }),
      Enquiry.countDocuments({
        ...gymMatch,
        status: { $in: [ENQUIRY_STATUS.NEW, ENQUIRY_STATUS.CONTACTED] },
      }),
      Invoice.find({ ...gymMatch, status: INVOICE_STATUS.UNPAID, number: { $not: /^FX-/ } })
        .select('member')
        .lean(),
      Subscription.find({
        ...gymMatch,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date() },
        $or: [{ payment: null }, { payment: { $exists: false } }],
      })
        .select('member')
        .lean(),
    ]);

    const pendingMemberIds = new Set<string>([
      ...unpaidInvoices.map((i) => String(i.member)),
      ...unpaidActiveSubs.map((s) => String(s.member)),
    ]);

    const membersDeltaPct =
      newMembersPrevMonth > 0
        ? Number((((newMembersThisMonth - newMembersPrevMonth) / newMembersPrevMonth) * 100).toFixed(1))
        : null;
    const revenueDeltaPct =
      prevMonthRevenue.totalPaise > 0
        ? Number(
            (
              ((monthRevenue.totalPaise - prevMonthRevenue.totalPaise) / prevMonthRevenue.totalPaise) *
              100
            ).toFixed(1),
          )
        : null;

    return {
      members,
      trainers,
      subscriptions: { active: activeSubs, expiringSoon: expiringSubs, expiringIn3Days },
      attendance: { today: checkedInToday },
      revenue: { allTimePaise: revenue.totalPaise, thisMonthPaise: monthRevenue.totalPaise },
      newMembersToday,
      newMembersThisMonth,
      openEnquiries,
      pendingPayments: pendingMemberIds.size,
      deltas: {
        membersThisMonthPct: membersDeltaPct,
        revenueThisMonthPct: revenueDeltaPct,
      },
    };
  },

  /**
   * Recent gym activity feed for owner dashboard (check-ins, joins, payments, expiries, enquiries).
   */
  async gymActivity(gymId: string, limit = 20, page = 1) {
    const gymOid = new Types.ObjectId(gymId);
    const gymMatch = { gym: gymOid };
    const take = Math.min(Math.max(limit, 1), 50);
    const pageNum = Math.max(1, page);
    const fetchWindow = take * pageNum;
    const perSource = Math.min(120, Math.max(take, Math.ceil(fetchWindow / 2) + take));

    const [checkIns, newMembers, payments, expiring, enquiries] = await Promise.all([
      Attendance.find({ ...gymMatch })
        .sort({ checkInAt: -1 })
        .limit(perSource)
        .populate('member', 'name')
        .lean(),
      User.find({ ...gymMatch, role: ROLES.MEMBER, deletedAt: null })
        .sort({ createdAt: -1 })
        .limit(perSource)
        .select('name createdAt')
        .lean(),
      Payment.find({
        ...gymMatch,
        status: PAYMENT_STATUS.PAID,
        purpose: { $ne: PAYMENT_PURPOSE.PLATFORM },
        'notes.purpose': { $ne: PAYMENT_PURPOSE.PLATFORM },
      })
        .sort({ paidAt: -1 })
        .limit(perSource)
        .populate('member', 'name')
        .lean(),
      Subscription.find({
        ...gymMatch,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * DAY_MS) },
      })
        .sort({ endDate: 1 })
        .limit(perSource)
        .populate('member', 'name')
        .lean(),
      Enquiry.find({ ...gymMatch })
        .sort({ createdAt: -1 })
        .limit(perSource)
        .lean(),
    ]);

    type ActivityItem = {
      id: string;
      type: 'check_in' | 'new_member' | 'payment' | 'expiring' | 'enquiry';
      title: string;
      tag: string;
      amountPaise?: number;
      at: Date;
    };

    const items: ActivityItem[] = [];

    for (const a of checkIns) {
      const name = (a.member as { name?: string } | null)?.name ?? 'Member';
      items.push({
        id: `checkin-${a._id}`,
        type: 'check_in',
        title: `${name} checked in`,
        tag: 'Check-in',
        at: a.checkInAt,
      });
    }
    for (const m of newMembers) {
      items.push({
        id: `member-${m._id}`,
        type: 'new_member',
        title: `${m.name} joined`,
        tag: 'New Member',
        at: m.createdAt,
      });
    }
    for (const p of payments) {
      const name = (p.member as { name?: string } | null)?.name ?? 'Member';
      items.push({
        id: `pay-${p._id}`,
        type: 'payment',
        title: `${name} payment received`,
        tag: 'Payment',
        amountPaise: p.amountPaise,
        at: p.paidAt ?? p.createdAt,
      });
    }
    for (const s of expiring) {
      const name = (s.member as { name?: string } | null)?.name ?? 'Member';
      const days = Math.max(0, Math.ceil((s.endDate.getTime() - Date.now()) / DAY_MS));
      items.push({
        id: `exp-${s._id}`,
        type: 'expiring',
        title: `${name} subscription expires in ${days} day${days === 1 ? '' : 's'}`,
        tag: 'Expiring',
        at: s.endDate,
      });
    }
    for (const e of enquiries) {
      items.push({
        id: `enq-${e._id}`,
        type: 'enquiry',
        title: `New enquiry from ${e.name}`,
        tag: 'Enquiry',
        at: e.createdAt,
      });
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    const start = (pageNum - 1) * take;
    const pageItems = items.slice(start, start + take);
    const sourceCapped =
      checkIns.length >= perSource ||
      newMembers.length >= perSource ||
      payments.length >= perSource ||
      expiring.length >= perSource ||
      enquiries.length >= perSource;
    const hasMore =
      items.length > start + pageItems.length || (sourceCapped && pageItems.length === take);
    const total = hasMore ? start + pageItems.length + take : start + pageItems.length;

    return {
      items: pageItems.map((i) => ({
        ...i,
        at: i.at.toISOString(),
      })),
      page: pageNum,
      limit: take,
      total,
    };
  },

  /**
   * Trainer dashboard: assigned members, plans authored, and today's schedule
   * derived from active workout-plan days + member attendance.
   */
  async trainer(ctx: Ctx) {
    const gym = ctx.tenantId;
    const trainerId = ctx.user._id;
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrow = new Date(todayStart.getTime() + DAY_MS);
    const weekday = now.getDay();
    const mondayIndex = weekday === 0 ? 6 : weekday - 1;

    const assignedFilter = {
      gym,
      role: ROLES.MEMBER,
      deletedAt: null,
      'memberProfile.assignedTrainer': trainerId,
    };

    const [assignedMembers, workouts, diets, assignedIds, plans] = await Promise.all([
      User.countDocuments(assignedFilter),
      WorkoutPlan.countDocuments({ gym, trainer: trainerId, deletedAt: null }),
      DietPlan.countDocuments({ gym, trainer: trainerId, deletedAt: null }),
      User.find(assignedFilter).select('_id').lean(),
      WorkoutPlan.find({ gym, trainer: trainerId, deletedAt: null, isActive: true })
        .select('title days member')
        .lean(),
    ]);

    const memberIds = assignedIds.map((m) => m._id);
    const attendanceToday = memberIds.length
      ? await Attendance.find({
          gym,
          member: { $in: memberIds },
          checkInAt: { $gte: todayStart, $lt: tomorrow },
        })
          .select('member status checkInAt')
          .lean()
      : [];

    type AttState = { status: string; checkInAt: Date };
    const attByMember = new Map<string, AttState>();
    for (const row of attendanceToday) {
      const key = String(row.member);
      const prev = attByMember.get(key);
      if (!prev || row.status === ATTENDANCE_STATUS.CHECKED_IN) {
        attByMember.set(key, { status: row.status, checkInAt: row.checkInAt });
      } else if (
        prev.status !== ATTENDANCE_STATUS.CHECKED_IN &&
        row.checkInAt < prev.checkInAt
      ) {
        attByMember.set(key, { status: row.status, checkInAt: row.checkInAt });
      }
    }

    type ScheduleGroup = {
      id: string;
      title: string;
      focus: string;
      memberIds: Set<string>;
      earliestCheckIn: Date | null;
    };
    const groups = new Map<string, ScheduleGroup>();

    for (const plan of plans) {
      const day = matchWorkoutDay(plan.days ?? [], weekday, mondayIndex);
      if (!day) continue;
      const focus = (day.focus || '').trim();
      const title = focus || plan.title || 'Training session';
      const key = `${plan.title}::${focus}`.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = {
          id: key,
          title,
          focus,
          memberIds: new Set(),
          earliestCheckIn: null,
        };
        groups.set(key, group);
      }
      const mid = String(plan.member);
      group.memberIds.add(mid);
      const att = attByMember.get(mid);
      if (att) {
        if (!group.earliestCheckIn || att.checkInAt < group.earliestCheckIn) {
          group.earliestCheckIn = att.checkInAt;
        }
      }
    }

    const statusRank: Record<string, number> = { Ongoing: 0, Upcoming: 1, Completed: 2 };

    const todaySchedule = [...groups.values()]
      .map((g) => {
        const members = [...g.memberIds];
        let open = 0;
        let done = 0;
        for (const mid of members) {
          const att = attByMember.get(mid);
          if (!att) continue;
          if (att.status === ATTENDANCE_STATUS.CHECKED_IN) open += 1;
          else done += 1;
        }

        let status: 'Completed' | 'Ongoing' | 'Upcoming' = 'Upcoming';
        if (open > 0) status = 'Ongoing';
        else if (members.length > 0 && done === members.length) status = 'Completed';
        else if (done > 0) status = 'Ongoing';

        return {
          id: g.id,
          title: g.title,
          focus: g.focus,
          memberCount: members.length,
          membersLabel: `${members.length} Member${members.length === 1 ? '' : 's'}`,
          status,
          time: g.earliestCheckIn ? formatClock(g.earliestCheckIn) : 'Today',
          checkInAt: g.earliestCheckIn ? g.earliestCheckIn.toISOString() : null,
        };
      })
      .sort((a, b) => {
        const sr = statusRank[a.status] - statusRank[b.status];
        if (sr !== 0) return sr;
        if (a.checkInAt && b.checkInAt) return a.checkInAt.localeCompare(b.checkInAt);
        if (a.checkInAt) return -1;
        if (b.checkInAt) return 1;
        return a.title.localeCompare(b.title);
      });

    const checkedInToday = [...attByMember.values()].filter(
      (a) => a.status === ATTENDANCE_STATUS.CHECKED_IN || a.status === ATTENDANCE_STATUS.CHECKED_OUT,
    ).length;

    return {
      assignedMembers,
      plans: { workouts, diets },
      checkedInToday,
      todaySchedule,
    };
  },

  /** Member dashboard: subscription, streak, today summary, plans. */
  async member(ctx: Ctx) {
    const gym = ctx.tenantId;
    const memberId = ctx.user._id;
    const todayStart = startOfDay();
    const now = new Date();

    // Calendar week starting Monday (local).
    const weekStart = startOfDay(now);
    const day = weekStart.getDay(); // 0=Sun … 6=Sat
    const mondayOffset = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

    const [
      current,
      attendanceCount,
      thisMonthAttendance,
      workouts,
      diets,
      todaySessions,
      weekSessions,
      recentSessions,
      memberUser,
    ] = await Promise.all([
      Subscription.findOne({
        gym,
        member: memberId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $gte: now },
      })
        .sort({ endDate: -1 })
        .populate('plan', 'name durationDays pricePaise'),
      Attendance.countDocuments({ gym, member: memberId }),
      Attendance.countDocuments({ gym, member: memberId, checkInAt: { $gte: startOfMonth() } }),
      WorkoutPlan.countDocuments({ gym, member: memberId, deletedAt: null, isActive: true }),
      DietPlan.countDocuments({ gym, member: memberId, deletedAt: null, isActive: true }),
      Attendance.find({ gym, member: memberId, checkInAt: { $gte: todayStart } }).lean(),
      Attendance.find({
        gym,
        member: memberId,
        checkInAt: { $gte: weekStart, $lt: weekEnd },
      })
        .select('checkInAt')
        .lean(),
      // Last ~60 days for streak calculation
      Attendance.find({
        gym,
        member: memberId,
        checkInAt: { $gte: new Date(now.getTime() - 60 * DAY_MS) },
      })
        .select('checkInAt')
        .sort({ checkInAt: -1 })
        .lean(),
      User.findById(memberId).select('memberProfile name phone').lean(),
    ]);

    // Unique attendance days (yyyy-mm-dd local).
    const attendedDays = new Set(
      recentSessions.map((s) => {
        const d = new Date(s.checkInAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );

    let streak = 0;
    const cursor = startOfDay(now);
    // If not checked in today, streak counts from yesterday.
    const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!attendedDays.has(todayKey)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    for (;;) {
      const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (!attendedDays.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Fold this week's sessions into attendedDays (in case recentSessions window edge).
    for (const s of weekSessions) {
      const d = new Date(s.checkInAt);
      attendedDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    const weekFlags = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getTime() + i * DAY_MS);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      return attendedDays.has(key);
    });

    // Today's gym time from attendance (completed sessions + open session elapsed).
    let workoutMinutes = 0;
    for (const s of todaySessions) {
      if (typeof s.durationMinutes === 'number' && s.durationMinutes > 0) {
        workoutMinutes += s.durationMinutes;
      } else if (s.checkInAt) {
        const end = s.checkOutAt ? new Date(s.checkOutAt) : now;
        workoutMinutes += Math.max(0, Math.round((end.getTime() - new Date(s.checkInAt).getTime()) / 60_000));
      }
    }

    /**
     * Wearables aren't integrated yet — derive today's activity from gym check-in time.
     * Moderate gym MET ≈ 8 kcal/min; steps ≈ 80/min.
     * Water: recommended daily intake from weight/BMI (+ gym session bonus).
     */
    const caloriesBurned = Math.round(workoutMinutes * 8);
    const steps = Math.round(workoutMinutes * 80);

    const mp = memberUser?.memberProfile;
    const heightCm = typeof mp?.heightCm === 'number' && mp.heightCm > 0 ? mp.heightCm : null;
    const weightKg = typeof mp?.weightKg === 'number' && mp.weightKg > 0 ? mp.weightKg : null;
    let bmi: number | null = null;
    if (heightCm && weightKg) {
      const m = heightCm / 100;
      bmi = Math.round((weightKg / (m * m)) * 10) / 10;
    }

    /** Recommended water for today (liters). null if profile weight missing. */
    let waterLiters: number | null = null;
    if (weightKg) {
      // Base ~35 ml/kg; BMI tweaks; +12 ml per workout minute.
      let ml = weightKg * 35;
      if (bmi != null) {
        if (bmi >= 30) ml *= 1.1;
        else if (bmi >= 25) ml *= 1.05;
        else if (bmi < 18.5) ml *= 0.95;
      }
      ml += workoutMinutes * 12;
      waterLiters = Math.round((ml / 1000) * 10) / 10;
    }

    const planDoc = current?.plan as { name?: string } | string | null | undefined;
    const planName =
      planDoc && typeof planDoc === 'object'
        ? planDoc.name
        : current?.planSnapshot?.name ?? null;

    return {
      subscription: current,
      planName,
      daysRemaining: current
        ? Math.max(0, Math.ceil((current.endDate.getTime() - now.getTime()) / DAY_MS))
        : 0,
      attendance: { total: attendanceCount, thisMonth: thisMonthAttendance, today: todaySessions.length },
      plans: { workouts, diets },
      streak: { current: streak, week: weekFlags },
      body: {
        heightCm,
        weightKg,
        bmi,
        gender: mp?.gender ?? 'unspecified',
        profileComplete: !!(heightCm && weightKg),
      },
      todaySummary: {
        source: 'estimated_from_attendance' as const,
        workoutMinutes,
        caloriesBurned,
        steps,
        waterLiters,
        waterSource: waterLiters != null ? ('bmi_weight' as const) : ('needs_profile' as const),
        checkedInToday: todaySessions.length > 0,
      },
    };
  },

  /** Revenue time series (last N months) for a gym or the whole platform. */
  async revenueSeries({ gymId = null, months = 6 }: { gymId?: string | null; months?: number }) {
    const from = startOfMonth(new Date(new Date().setMonth(new Date().getMonth() - (months - 1))));
    const match: Record<string, unknown> = {
      status: PAYMENT_STATUS.PAID,
      paidAt: { $gte: from },
    };
    if (gymId) {
      match.gym = new Types.ObjectId(gymId);
      match.purpose = { $ne: PAYMENT_PURPOSE.PLATFORM };
      match['notes.purpose'] = { $ne: PAYMENT_PURPOSE.PLATFORM };
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } },
          totalPaise: { $sum: '$amountPaise' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ];

    const rows = await Payment.aggregate<{ _id: { y: number; m: number }; totalPaise: number; count: number }>(pipeline);
    return rows.map((r) => ({ year: r._id.y, month: r._id.m, totalPaise: r.totalPaise, count: r.count }));
  },
};

export default reportsService;
