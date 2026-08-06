import { Types, type FilterQuery, type Model, type HydratedDocument } from 'mongoose';
import { WorkoutPlan, type IWorkoutPlan, type WorkoutDay, type Exercise } from './workoutPlan.model';
import { DietPlan, type IDietPlan } from './dietPlan.model';
import { ProgressLog, type ProgressLogDocument } from './progressLog.model';
import {
  DefaultWeeklyWorkout,
  type ScheduleDayTemplate,
  type ScheduleExercise,
} from './defaultWeeklyWorkout.model';
import { buildDefaultWeeks, WEEKDAY_ORDER } from './defaultWorkoutData';
import { User } from '../users/user.model';
import { ApiError } from '../../utils/ApiError';
import { ROLES, type NotificationType } from '../../config/constants';
import { parseListQuery } from '../../utils/pagination';
import { notificationService } from '../notifications/notification.service';
import type { Ctx, Paginated } from '../../types/index';
import type {
  CreateProgressInput,
  BulkAssignWorkoutInput,
  CreateWorkoutTemplateInput,
  UpdateWorkoutTemplateInput,
} from './fitness.validators';
import { getWorkoutTemplate, listWorkoutTemplates as listBuiltinStarters } from './workoutTemplates';
import { WorkoutTemplate } from './workoutTemplate.model';

const DEFAULT_KEY = 'member_default_weekly';
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface PlanBase {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  trainer: Types.ObjectId;
  title: string;
  isActive: boolean;
  deletedAt: Date | null;
}

interface ListLike {
  memberId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}

export interface MemberScheduleExercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes: string;
}

export interface MemberScheduleDay {
  date: string;
  weekday: number;
  dow: string;
  dayNum: number;
  title: string;
  focus: string;
  estimatedMinutes: number;
  exerciseCount: number;
  exercises: MemberScheduleExercise[];
}

export interface MemberScheduleResult {
  source: 'trainer' | 'default';
  selectedDate: string;
  weekOfMonth: number;
  weekLabel: string;
  planTitle: string;
  planDescription: string;
  trainer: { _id: string; name: string } | null;
  week: MemberScheduleDay[];
  selected: MemberScheduleDay | null;
  myPlan: {
    title: string;
    description: string;
    source: 'trainer' | 'default';
    days: {
      label: string;
      title: string;
      focus: string;
      estimatedMinutes: number;
      exerciseCount: number;
    }[];
  };
}

function requireTenant(ctx: Ctx): string {
  if (!ctx.tenantId) throw ApiError.badRequest('A gym context is required');
  return ctx.tenantId;
}

async function resolveMember(ctx: Ctx, memberId?: string): Promise<Types.ObjectId> {
  if (ctx.user.role === ROLES.MEMBER) return ctx.user._id;
  const member = await User.findOne({
    _id: memberId,
    gym: requireTenant(ctx),
    role: ROLES.MEMBER,
    deletedAt: null,
  });
  if (!member) throw ApiError.notFound('Member not found in this gym');
  return member._id;
}

function scopeFilter(ctx: Ctx, q: ListLike, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const filter: Record<string, unknown> = { gym: requireTenant(ctx), ...extra };
  if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
  else if (q.memberId) filter.member = q.memberId;
  else if (ctx.user.role === ROLES.TRAINER) filter.trainer = ctx.user._id;
  return filter;
}

function makeCrud<TDoc extends PlanBase>(model: Model<TDoc>, label: string, notifyType: NotificationType) {
  type Doc = HydratedDocument<TDoc>;
  return {
    async list(ctx: Ctx): Promise<Paginated<Doc>> {
      const q = (ctx.validatedQuery ?? {}) as ListLike;
      const { page, limit, skip, sort } = parseListQuery(q);
      const filter = scopeFilter(ctx, q, { deletedAt: null });
      if (q.isActive !== undefined) filter.isActive = q.isActive;
      const [items, total] = await Promise.all([
        model
          .find(filter as FilterQuery<TDoc>)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('member', 'name email')
          .populate('trainer', 'name email'),
        model.countDocuments(filter as FilterQuery<TDoc>),
      ]);
      return { items: items as Doc[], page, limit, total };
    },

    async get(ctx: Ctx, id: string): Promise<Doc> {
      const filter: Record<string, unknown> = { _id: id, gym: requireTenant(ctx), deletedAt: null };
      if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
      const doc = await model
        .findOne(filter as FilterQuery<TDoc>)
        .populate('member', 'name email')
        .populate('trainer', 'name email');
      if (!doc) throw ApiError.notFound(`${label} not found`);
      return doc as Doc;
    },

    async create(
      ctx: Ctx,
      data: { memberId?: string; title: string } & Record<string, unknown>,
    ): Promise<Doc> {
      const { memberId, ...rest } = data;
      const member = await resolveMember(ctx, memberId);
      const create = model.create.bind(model) as unknown as (doc: Record<string, unknown>) => Promise<Doc>;
      const doc = await create({ ...rest, member, gym: requireTenant(ctx), trainer: ctx.user._id });
      await notificationService.notify({
        gym: requireTenant(ctx),
        user: member,
        type: notifyType,
        event: notifyType === 'workout' ? 'trainer.workout_assigned' : notifyType === 'diet' ? 'trainer.diet_updated' : undefined,
        title: `New ${label.toLowerCase()} assigned`,
        body: data.title,
        data: { id: String((doc as Doc)._id), deepLink: notifyType === 'workout' ? 'Workout' : 'Nutrition' },
      });
      return doc as Doc;
    },

    async update(ctx: Ctx, id: string, data: Record<string, unknown>): Promise<Doc> {
      const doc = await model.findOne({
        _id: id,
        gym: requireTenant(ctx),
        deletedAt: null,
      } as FilterQuery<TDoc>);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      Object.assign(doc, data);
      await doc.save();
      return doc as Doc;
    },

    async remove(ctx: Ctx, id: string): Promise<{ deleted: true }> {
      const doc = await model.findOne({
        _id: id,
        gym: requireTenant(ctx),
        deletedAt: null,
      } as FilterQuery<TDoc>);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      (doc as unknown as PlanBase).deletedAt = new Date();
      (doc as unknown as PlanBase).isActive = false;
      await doc.save();
      return { deleted: true };
    },
  };
}

const workouts = makeCrud<IWorkoutPlan>(WorkoutPlan, 'Workout plan', 'workout');
const diets = makeCrud<IDietPlan>(DietPlan, 'Diet plan', 'workout');

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export interface ProgressMetricSeries {
  latest: number | null;
  unit: string;
  delta: number | null;
  deltaLabel: string | null;
  data: number[];
  labels: string[];
  hasData: boolean;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekOfMonthIndex(d: Date): number {
  return Math.min(3, Math.floor((d.getDate() - 1) / 7));
}

function mondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = startOfDay(d);
  mon.setDate(mon.getDate() + diff);
  return mon;
}

function mapExercises(list: ScheduleExercise[] | Exercise[] | undefined): MemberScheduleExercise[] {
  return (list ?? []).map(e => ({
    name: e.name,
    sets: e.sets ?? 3,
    reps: e.reps ?? '10',
    restSeconds: e.restSeconds ?? 60,
    notes: e.notes ?? '',
  }));
}

function estimatedFromExercises(exercises: MemberScheduleExercise[], fallback = 40): number {
  if (!exercises.length) return fallback;
  const mins = exercises.reduce((sum, e) => {
    const sets = Math.max(1, e.sets || 1);
    return sum + sets * 2.5 + (e.restSeconds || 0) / 60;
  }, 0);
  return Math.max(15, Math.round(mins));
}

function dayFromTemplate(date: Date, tmpl: ScheduleDayTemplate): MemberScheduleDay {
  const exercises = mapExercises(tmpl.exercises);
  return {
    date: toYmd(date),
    weekday: date.getDay(),
    dow: DOW[date.getDay()],
    dayNum: date.getDate(),
    title: tmpl.title,
    focus: tmpl.focus,
    estimatedMinutes: tmpl.estimatedMinutes || estimatedFromExercises(exercises),
    exerciseCount: exercises.length,
    exercises,
  };
}

function matchTrainerDay(planDays: WorkoutDay[], weekday: number, indexInWeek: number): WorkoutDay | null {
  if (!planDays.length) return null;
  const name = WEEKDAY_NAMES[weekday].toLowerCase();
  const short = DOW[weekday].toLowerCase();
  const byName = planDays.find(d => {
    const label = (d.day || '').toLowerCase();
    return label.includes(name) || label === short || label.startsWith(name.slice(0, 3));
  });
  if (byName) return byName;
  return planDays[indexInWeek % planDays.length];
}

async function ensureDefaultSchedule() {
  const existing = await DefaultWeeklyWorkout.findOne({ key: DEFAULT_KEY });
  if (existing && existing.weeks?.length === 4) return existing;
  return DefaultWeeklyWorkout.findOneAndUpdate(
    { key: DEFAULT_KEY },
    {
      $set: {
        key: DEFAULT_KEY,
        title: 'Default Weekly Schedule',
        description:
          '7 unique workouts rotated across 4 weeks of the month for members without a trainer.',
        weeks: buildDefaultWeeks(),
      },
    },
    { upsert: true, new: true },
  );
}

export const fitnessService = {
  workouts,
  diets,

  /** Built-in starters used when creating a custom template. */
  listBuiltinStarters() {
    return listBuiltinStarters();
  },

  /** Custom templates for this trainer (gym-scoped). */
  async listCustomTemplates(ctx: Ctx) {
    const gym = requireTenant(ctx);
    const filter: Record<string, unknown> = { gym, deletedAt: null, isActive: true };
    if (ctx.user.role === ROLES.TRAINER) filter.trainer = ctx.user._id;
    const docs = await WorkoutTemplate.find(filter).sort({ updatedAt: -1 }).lean();
    return docs.map((d) => ({
      id: String(d._id),
      _id: String(d._id),
      name: d.title,
      title: d.title,
      description: d.description,
      cadence: d.cadence,
      dayCount: d.days?.length ?? 0,
      days: d.days,
      preview: (d.days ?? []).map((day) => ({
        day: day.day,
        focus: day.focus,
        exercises: day.exercises?.length ?? 0,
      })),
      isCustom: true,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  },

  async getCustomTemplate(ctx: Ctx, id: string) {
    const gym = requireTenant(ctx);
    const filter: Record<string, unknown> = { _id: id, gym, deletedAt: null };
    if (ctx.user.role === ROLES.TRAINER) filter.trainer = ctx.user._id;
    const doc = await WorkoutTemplate.findOne(filter);
    if (!doc) throw ApiError.notFound('Workout template not found');
    return doc;
  },

  async createCustomTemplate(ctx: Ctx, input: CreateWorkoutTemplateInput) {
    const gym = requireTenant(ctx);
    let days: WorkoutDay[] = [];
    if (input.days?.length) {
      days = input.days.map((d) => ({
        day: d.day,
        focus: d.focus ?? '',
        exercises: (d.exercises ?? []).map((e) => ({
          name: e.name,
          sets: e.sets ?? 3,
          reps: e.reps ?? '10',
          restSeconds: e.restSeconds ?? 60,
          notes: e.notes ?? '',
        })),
      }));
    } else if (input.starterId) {
      const starter = getWorkoutTemplate(input.starterId);
      if (!starter) throw ApiError.badRequest('Unknown starter template');
      days = starter.buildDays();
    }
    if (!days.length) throw ApiError.badRequest('Add at least one workout day');

    return WorkoutTemplate.create({
      gym,
      trainer: ctx.user._id,
      title: input.title,
      description: input.description ?? '',
      cadence: input.cadence ?? 'weekly',
      days,
      isActive: true,
    });
  },

  async updateCustomTemplate(ctx: Ctx, id: string, input: UpdateWorkoutTemplateInput) {
    const doc = await this.getCustomTemplate(ctx, id);
    if (input.title !== undefined) doc.title = input.title;
    if (input.description !== undefined) doc.description = input.description;
    if (input.cadence !== undefined) doc.cadence = input.cadence;
    if (input.days !== undefined) {
      doc.days = input.days.map((d) => ({
        day: d.day,
        focus: d.focus ?? '',
        exercises: (d.exercises ?? []).map((e) => ({
          name: e.name,
          sets: e.sets ?? 3,
          reps: e.reps ?? '10',
          restSeconds: e.restSeconds ?? 60,
          notes: e.notes ?? '',
        })),
      }));
    }
    if (input.isActive !== undefined) doc.isActive = input.isActive;
    await doc.save();
    return doc;
  },

  async removeCustomTemplate(ctx: Ctx, id: string) {
    const doc = await this.getCustomTemplate(ctx, id);
    doc.deletedAt = new Date();
    doc.isActive = false;
    await doc.save();
    return { deleted: true as const };
  },

  /**
   * Assign the same workout plan to many members (trainer multi-select).
   * Optionally deactivates each member's previous active plans.
   */
  async bulkAssignWorkouts(ctx: Ctx, input: BulkAssignWorkoutInput) {
    const gym = requireTenant(ctx);
    const trainerId = ctx.user._id;
    const replaceActive = input.replaceActive !== false;

    let days = input.days ?? [];
    if ((!days || days.length === 0) && input.templateId) {
      const tid = input.templateId;
      const builtin = getWorkoutTemplate(tid);
      if (builtin) {
        days = builtin.buildDays();
      } else if (Types.ObjectId.isValid(tid)) {
        const custom = await WorkoutTemplate.findOne({
          _id: tid,
          gym,
          deletedAt: null,
        });
        if (!custom) throw ApiError.notFound('Workout template not found');
        if (
          ctx.user.role === ROLES.TRAINER &&
          String(custom.trainer) !== String(trainerId)
        ) {
          throw ApiError.forbidden('This template does not belong to you');
        }
        days = custom.days as WorkoutDay[];
        if (!input.title) {
          // title is required by schema, but keep description fallback
        }
      } else {
        throw ApiError.badRequest('Unknown workout template');
      }
    }
    if (!days.length) throw ApiError.badRequest('Workout days are required');

    const uniqueIds = [...new Set(input.memberIds.map(String))];
    const members = await User.find({
      _id: { $in: uniqueIds },
      gym,
      role: ROLES.MEMBER,
      deletedAt: null,
    }).select('_id name memberProfile.assignedTrainer');

    if (members.length !== uniqueIds.length) {
      throw ApiError.badRequest('One or more members were not found in this gym');
    }

    if (ctx.user.role === ROLES.TRAINER) {
      const notMine = members.filter(
        (m) => String(m.memberProfile?.assignedTrainer ?? '') !== String(trainerId),
      );
      if (notMine.length) {
        throw ApiError.forbidden('You can only assign workouts to your assigned members');
      }
    }

    const created: HydratedDocument<IWorkoutPlan>[] = [];
    for (const member of members) {
      if (replaceActive) {
        await WorkoutPlan.updateMany(
          { gym, member: member._id, deletedAt: null, isActive: true },
          { $set: { isActive: false } },
        );
      }
      const doc = await WorkoutPlan.create({
        gym,
        member: member._id,
        trainer: trainerId,
        title: input.title,
        description: input.description ?? '',
        days,
        isActive: true,
      });
      created.push(doc);
      await notificationService.notify({
        gym,
        user: member._id,
        type: 'workout',
        title: 'New workout plan assigned',
        body: input.title,
        data: { id: String(doc._id) },
      });
    }

    return {
      assigned: created.length,
      planIds: created.map((d) => String(d._id)),
      title: input.title,
      templateId: input.templateId ?? null,
      memberIds: uniqueIds,
    };
  },

  async seedDefaultWeekly() {
    return ensureDefaultSchedule();
  },

  async memberSchedule(ctx: Ctx, dateStr?: string): Promise<MemberScheduleResult> {
    const memberId = ctx.user._id;
    const selectedDate = dateStr ? parseYmd(dateStr) : startOfDay(new Date());
    const weekStart = mondayOfWeek(selectedDate);
    const wom = weekOfMonthIndex(selectedDate);

    const [member, trainerPlan] = await Promise.all([
      User.findById(memberId).select('memberProfile name').lean(),
      WorkoutPlan.findOne({
        gym: requireTenant(ctx),
        member: memberId,
        isActive: true,
        deletedAt: null,
      })
        .sort({ updatedAt: -1 })
        .populate('trainer', 'name')
        .lean(),
    ]);

    const hasTrainer = !!member?.memberProfile?.assignedTrainer;
    const useTrainer = hasTrainer && !!trainerPlan && (trainerPlan.days?.length ?? 0) > 0;

    let week: MemberScheduleDay[] = [];
    let planTitle = '';
    let planDescription = '';
    let trainer: { _id: string; name: string } | null = null;
    let source: 'trainer' | 'default' = 'default';

    if (useTrainer && trainerPlan) {
      source = 'trainer';
      planTitle = trainerPlan.title;
      planDescription = trainerPlan.description || 'Assigned by your trainer';
      const t = trainerPlan.trainer as unknown as { _id?: Types.ObjectId; name?: string } | Types.ObjectId;
      if (t && typeof t === 'object' && 'name' in t) {
        trainer = { _id: String(t._id), name: t.name || 'Trainer' };
      }

      week = WEEKDAY_ORDER.map((_weekday, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const planDay = matchTrainerDay(trainerPlan.days, d.getDay(), i);
        const exercises = mapExercises(planDay?.exercises);
        return {
          date: toYmd(d),
          weekday: d.getDay(),
          dow: DOW[d.getDay()],
          dayNum: d.getDate(),
          title: planDay?.day || planDay?.focus || 'Workout',
          focus: planDay?.focus || '',
          estimatedMinutes: estimatedFromExercises(exercises),
          exerciseCount: exercises.length,
          exercises,
        };
      });
    } else {
      source = 'default';
      const doc = await ensureDefaultSchedule();
      const weekTmpl = doc.weeks.find(w => w.weekIndex === wom) ?? doc.weeks[0];
      planTitle = doc.title;
      planDescription =
        doc.description ||
        `Week ${wom + 1} of this month — default schedule (no trainer assigned)`;

      week = WEEKDAY_ORDER.map((weekday, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const tmpl =
          weekTmpl.days.find(x => x.weekday === d.getDay()) ??
          weekTmpl.days.find(x => x.weekday === weekday) ??
          weekTmpl.days[i];
        return dayFromTemplate(d, tmpl);
      });
    }

    const selectedYmd = toYmd(selectedDate);
    const selected =
      week.find(d => d.date === selectedYmd) ??
      week.find(d => d.dayNum === selectedDate.getDate()) ??
      week[0] ??
      null;

    return {
      source,
      selectedDate: selectedYmd,
      weekOfMonth: wom + 1,
      weekLabel: `Week ${wom + 1}`,
      planTitle,
      planDescription,
      trainer,
      week,
      selected,
      myPlan: {
        title: planTitle,
        description: planDescription,
        source,
        days: week.map(d => ({
          label: `${WEEKDAY_NAMES[d.weekday]} ${d.dayNum}`,
          title: d.title,
          focus: d.focus,
          estimatedMinutes: d.estimatedMinutes,
          exerciseCount: d.exerciseCount,
        })),
      },
    };
  },

  async listProgress(ctx: Ctx): Promise<Paginated<ProgressLogDocument>> {
    const q = (ctx.validatedQuery ?? {}) as ListLike;
    const { page, limit, skip, sort } = parseListQuery(q, { defaultSort: 'date' });
    const filter = scopeFilter(ctx, q);
    const [items, total] = await Promise.all([
      ProgressLog.find(filter).sort(sort).skip(skip).limit(limit),
      ProgressLog.countDocuments(filter),
    ]);
    return { items, page, limit, total };
  },

  /**
   * Time-bucketed progress for member charts.
   * Muscle mass ≈ lean mass = weight × (1 − bodyFat%/100) when both exist.
   */
  async progressSeries(
    ctx: Ctx,
    range: 'week' | 'month' | 'year' = 'week',
    memberIdParam?: string,
  ): Promise<{
    range: 'week' | 'month' | 'year';
    from: string;
    to: string;
    metrics: {
      weight: ProgressMetricSeries;
      bodyFat: ProgressMetricSeries;
      muscleMass: ProgressMetricSeries;
    };
  }> {
    const memberId = await resolveMember(ctx, memberIdParam);
    const gym = requireTenant(ctx);
    const now = startOfDay(new Date());
    const to = endOfDay(now);

    let from: Date;
    let bucketCount: number;
    let labelFn: (d: Date, i: number) => string;
    let bucketStart: (i: number) => Date;

    if (range === 'week') {
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from = startOfDay(from);
      bucketCount = 7;
      labelFn = d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      bucketStart = i => {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        return startOfDay(d);
      };
    } else if (range === 'month') {
      from = new Date(now);
      from.setDate(from.getDate() - 29);
      from = startOfDay(from);
      bucketCount = 6;
      labelFn = (_d, i) => `W${i + 1}`;
      bucketStart = i => {
        const d = new Date(from);
        d.setDate(from.getDate() + i * 5);
        return startOfDay(d);
      };
    } else {
      from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      bucketCount = 12;
      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      labelFn = d => MONTHS[d.getMonth()];
      bucketStart = i => new Date(from.getFullYear(), from.getMonth() + i, 1);
    }

    const logs = await ProgressLog.find({
      gym,
      member: memberId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();

    type Point = { weight?: number; bodyFat?: number; muscle?: number; at: Date };
    const points: Point[] = logs.map(l => {
      const weight = typeof l.weightKg === 'number' ? l.weightKg : undefined;
      const bodyFat = typeof l.bodyFatPct === 'number' ? l.bodyFatPct : undefined;
      const muscle =
        weight != null && bodyFat != null
          ? Math.round(weight * (1 - bodyFat / 100) * 10) / 10
          : undefined;
      return { weight, bodyFat, muscle, at: new Date(l.date) };
    });

    const weightVals: (number | null)[] = [];
    const fatVals: (number | null)[] = [];
    const muscleVals: (number | null)[] = [];
    const labels: string[] = [];

    let lastW: number | null = null;
    let lastF: number | null = null;
    let lastM: number | null = null;

    const prior = await ProgressLog.findOne({
      gym,
      member: memberId,
      date: { $lt: from },
    })
      .sort({ date: -1 })
      .lean();
    if (prior) {
      if (typeof prior.weightKg === 'number') lastW = prior.weightKg;
      if (typeof prior.bodyFatPct === 'number') lastF = prior.bodyFatPct;
      if (lastW != null && lastF != null) lastM = Math.round(lastW * (1 - lastF / 100) * 10) / 10;
    }

    for (let i = 0; i < bucketCount; i++) {
      const start = bucketStart(i);
      const end =
        range === 'year'
          ? new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
          : range === 'month'
            ? endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 4))
            : endOfDay(start);

      const inBucket = points.filter(p => p.at >= start && p.at <= end);
      const latest = inBucket[inBucket.length - 1];
      if (latest?.weight != null) lastW = latest.weight;
      if (latest?.bodyFat != null) lastF = latest.bodyFat;
      if (latest?.muscle != null) lastM = latest.muscle;
      else if (lastW != null && lastF != null) lastM = Math.round(lastW * (1 - lastF / 100) * 10) / 10;

      weightVals.push(lastW);
      fatVals.push(lastF);
      muscleVals.push(lastM);
      labels.push(labelFn(start, i));
    }

    const build = (
      vals: (number | null)[],
      unit: string,
      decimals: number,
    ): ProgressMetricSeries => {
      const numeric = vals.filter((v): v is number => v != null);
      const latest = numeric.length ? numeric[numeric.length - 1] : null;
      const first = numeric.length ? numeric[0] : null;
      const delta = latest != null && first != null ? latest - first : null;

      let carry: number | null = null;
      const data: number[] = [];
      const outLabels: string[] = [];
      vals.forEach((v, i) => {
        if (v != null) carry = v;
        if (carry != null) {
          data.push(carry);
          outLabels.push(labels[i]);
        }
      });
      // Line chart needs ≥2 points
      if (data.length === 1) {
        data.push(data[0]);
        outLabels.push(outLabels[0]);
      }

      return {
        latest,
        unit,
        delta,
        deltaLabel:
          delta == null
            ? null
            : `${delta >= 0 ? '+' : ''}${delta.toFixed(decimals)}${unit === '%' ? '%' : ` ${unit}`}`,
        data,
        labels: outLabels,
        hasData: numeric.length > 0,
      };
    };

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      metrics: {
        weight: build(weightVals, 'kg', 1),
        bodyFat: build(fatVals, '%', 1),
        muscleMass: build(muscleVals, 'kg', 1),
      },
    };
  },

  async createProgress(ctx: Ctx, data: CreateProgressInput): Promise<ProgressLogDocument> {
    const member = await resolveMember(ctx, data.memberId);
    return ProgressLog.create({
      gym: requireTenant(ctx),
      member,
      recordedBy: ctx.user._id,
      date: data.date ?? new Date(),
      weightKg: data.weightKg,
      bodyFatPct: data.bodyFatPct,
      measurements: data.measurements,
      notes: data.notes,
    });
  },

  async removeProgress(ctx: Ctx, id: string): Promise<{ deleted: true }> {
    const filter: Record<string, unknown> = { _id: id, gym: requireTenant(ctx) };
    if (ctx.user.role === ROLES.MEMBER) filter.member = ctx.user._id;
    const doc = await ProgressLog.findOneAndDelete(filter);
    if (!doc) throw ApiError.notFound('Progress log not found');
    return { deleted: true };
  },
};

export default fitnessService;
