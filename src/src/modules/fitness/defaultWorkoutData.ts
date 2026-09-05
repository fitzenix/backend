import type { ScheduleDayTemplate, ScheduleExercise, ScheduleWeekTemplate } from './defaultWeeklyWorkout.model';

/** Seven distinct workouts used as the no-trainer monthly rotation pool. */
export const WORKOUT_POOL: Omit<ScheduleDayTemplate, 'weekday'>[] = [
  {
    title: 'Push Strength',
    focus: 'Chest · Shoulders · Triceps',
    estimatedMinutes: 50,
    exercises: [
      { name: 'Warm Up — Arm Circles', sets: 1, reps: '2 min', restSeconds: 0, notes: 'Light cardio' },
      { name: 'Bench Press', sets: 4, reps: '8-10', restSeconds: 90, notes: '' },
      { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 75, notes: '' },
      { name: 'Overhead Press', sets: 3, reps: '8-10', restSeconds: 75, notes: '' },
      { name: 'Tricep Pushdowns', sets: 3, reps: '12-15', restSeconds: 60, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Pull Strength',
    focus: 'Back · Biceps',
    estimatedMinutes: 50,
    exercises: [
      { name: 'Warm Up — Band Pull-Aparts', sets: 1, reps: '2 min', restSeconds: 0, notes: '' },
      { name: 'Deadlift', sets: 4, reps: '5', restSeconds: 120, notes: '' },
      { name: 'Lat Pulldown', sets: 3, reps: '10-12', restSeconds: 75, notes: '' },
      { name: 'Seated Row', sets: 3, reps: '10-12', restSeconds: 75, notes: '' },
      { name: 'Barbell Curl', sets: 3, reps: '10-12', restSeconds: 60, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Leg Day',
    focus: 'Quads · Hamstrings · Glutes',
    estimatedMinutes: 55,
    exercises: [
      { name: 'Warm Up — Bodyweight Squats', sets: 1, reps: '2 min', restSeconds: 0, notes: '' },
      { name: 'Back Squat', sets: 4, reps: '8-10', restSeconds: 120, notes: '' },
      { name: 'Romanian Deadlift', sets: 3, reps: '10', restSeconds: 90, notes: '' },
      { name: 'Walking Lunges', sets: 3, reps: '12/leg', restSeconds: 75, notes: '' },
      { name: 'Calf Raises', sets: 3, reps: '15', restSeconds: 45, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Core & Cardio',
    focus: 'Abs · Conditioning',
    estimatedMinutes: 40,
    exercises: [
      { name: 'Jump Rope / Bike', sets: 1, reps: '8 min', restSeconds: 0, notes: 'Steady pace' },
      { name: 'Plank', sets: 3, reps: '45 sec', restSeconds: 45, notes: '' },
      { name: 'Hanging Knee Raises', sets: 3, reps: '12', restSeconds: 45, notes: '' },
      { name: 'Russian Twists', sets: 3, reps: '20', restSeconds: 45, notes: '' },
      { name: 'Mountain Climbers', sets: 3, reps: '30 sec', restSeconds: 40, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Upper Body Pump',
    focus: 'Chest · Back · Arms',
    estimatedMinutes: 45,
    exercises: [
      { name: 'Warm Up — Light Rowing', sets: 1, reps: '3 min', restSeconds: 0, notes: '' },
      { name: 'Push-Ups', sets: 3, reps: '12-15', restSeconds: 60, notes: '' },
      { name: 'Dumbbell Flyes', sets: 3, reps: '12', restSeconds: 60, notes: '' },
      { name: 'Face Pulls', sets: 3, reps: '15', restSeconds: 45, notes: '' },
      { name: 'Hammer Curls', sets: 3, reps: '12', restSeconds: 45, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Lower Power',
    focus: 'Glutes · Hamstrings · Stability',
    estimatedMinutes: 45,
    exercises: [
      { name: 'Warm Up — Hip Openers', sets: 1, reps: '3 min', restSeconds: 0, notes: '' },
      { name: 'Hip Thrusts', sets: 4, reps: '10-12', restSeconds: 90, notes: '' },
      { name: 'Bulgarian Split Squats', sets: 3, reps: '10/leg', restSeconds: 75, notes: '' },
      { name: 'Leg Curl', sets: 3, reps: '12', restSeconds: 60, notes: '' },
      { name: 'Side Plank', sets: 3, reps: '30 sec/side', restSeconds: 40, notes: '' },
      { name: 'Cool Down Stretch', sets: 1, reps: '5 min', restSeconds: 0, notes: '' },
    ],
  },
  {
    title: 'Active Recovery',
    focus: 'Mobility · Light Cardio',
    estimatedMinutes: 30,
    exercises: [
      { name: 'Easy Walk / Bike', sets: 1, reps: '10 min', restSeconds: 0, notes: '' },
      { name: "World's Greatest Stretch", sets: 2, reps: '5/side', restSeconds: 30, notes: '' },
      { name: 'Cat-Cow', sets: 2, reps: '10', restSeconds: 20, notes: '' },
      { name: 'Foam Roll — Quads & Back', sets: 1, reps: '8 min', restSeconds: 0, notes: '' },
      { name: 'Breathing / Cool Down', sets: 1, reps: '3 min', restSeconds: 0, notes: '' },
    ],
  },
];

/** Mon→Sun weekday order used in weekly grids (Mon first for gym UX). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const; // Mon…Sat, Sun

function withWeekday(poolIndex: number, weekday: number): ScheduleDayTemplate {
  const base = WORKOUT_POOL[poolIndex % WORKOUT_POOL.length];
  return {
    weekday,
    title: base.title,
    focus: base.focus,
    estimatedMinutes: base.estimatedMinutes,
    exercises: base.exercises.map((e: ScheduleExercise) => ({ ...e })),
  };
}

/**
 * Build 4 monthly week rotations so all 7 workouts appear, shuffled each week.
 * Week 0: identity · Week 1: +2 · Week 2: +4 · Week 3: reverse
 */
export function buildDefaultWeeks(): ScheduleWeekTemplate[] {
  const rotations: number[][] = [
    [0, 1, 2, 3, 4, 5, 6],
    [2, 3, 4, 5, 6, 0, 1],
    [4, 5, 6, 0, 1, 2, 3],
    [6, 5, 4, 3, 2, 1, 0],
  ];

  return rotations.map((order, weekIndex) => ({
    weekIndex,
    days: WEEKDAY_ORDER.map((weekday, i) => withWeekday(order[i], weekday)),
  }));
}
