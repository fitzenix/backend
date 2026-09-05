import { WORKOUT_POOL, WEEKDAY_ORDER } from './defaultWorkoutData';
import type { WorkoutDay, Exercise } from './workoutPlan.model';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toExercises(
  list: { name: string; sets?: number; reps?: string; restSeconds?: number; notes?: string }[],
): Exercise[] {
  return list.map((e) => ({
    name: e.name,
    sets: e.sets ?? 3,
    reps: e.reps ?? '10',
    restSeconds: e.restSeconds ?? 60,
    notes: e.notes ?? '',
  }));
}

function dayFromPool(poolIndex: number, weekday: number): WorkoutDay {
  const tmpl = WORKOUT_POOL[poolIndex % WORKOUT_POOL.length];
  return {
    day: WEEKDAY_NAMES[weekday],
    focus: tmpl.focus,
    exercises: toExercises(tmpl.exercises),
  };
}

/** Built-in plans trainers can assign to one or many members. */
export const WORKOUT_TEMPLATES = [
  {
    id: 'default_weekly',
    name: 'Default Weekly Plan',
    description: '7-day rotation from the gym default pool (Mon–Sun).',
    cadence: 'weekly' as const,
    buildDays: (): WorkoutDay[] =>
      WEEKDAY_ORDER.map((weekday, i) => dayFromPool(i, weekday)),
  },
  {
    id: 'push_pull_legs',
    name: 'Push / Pull / Legs',
    description: 'Classic PPL split across the week with Sunday recovery.',
    cadence: 'weekly' as const,
    buildDays: (): WorkoutDay[] => {
      // pool: 0 push, 1 pull, 2 legs, 3 core, 6 recovery
      const map = [0, 1, 2, 0, 1, 2, 6];
      return WEEKDAY_ORDER.map((weekday, i) => dayFromPool(map[i], weekday));
    },
  },
  {
    id: 'daily_full_body',
    name: 'Daily Full Body',
    description: 'Same full-body session every day — good for beginners.',
    cadence: 'daily' as const,
    buildDays: (): WorkoutDay[] =>
      WEEKDAY_ORDER.map((weekday) => dayFromPool(4, weekday)), // Upper Body Pump
  },
  {
    id: 'strength_3day',
    name: '3-Day Strength',
    description: 'Push, Pull, Legs — other days marked as active recovery.',
    cadence: 'weekly' as const,
    buildDays: (): WorkoutDay[] => {
      const map = [0, 1, 2, 6, 6, 6, 6];
      return WEEKDAY_ORDER.map((weekday, i) => dayFromPool(map[i], weekday));
    },
  },
] as const;

export type WorkoutTemplateId = (typeof WORKOUT_TEMPLATES)[number]['id'];

export function getWorkoutTemplate(id: string) {
  return WORKOUT_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function listWorkoutTemplates() {
  return WORKOUT_TEMPLATES.map(({ id, name, description, cadence, buildDays }) => ({
    id,
    name,
    description,
    cadence,
    dayCount: buildDays().length,
    preview: buildDays().map((d) => ({ day: d.day, focus: d.focus, exercises: d.exercises.length })),
  }));
}
