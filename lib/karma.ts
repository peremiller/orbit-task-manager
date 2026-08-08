export type KarmaTask = { completed: boolean; completedAt?: string | null };

export type KarmaDay = {
  label: string;
  date: string;
  count: number;
  goalMet: boolean;
  isToday: boolean;
};

export type KarmaStats = {
  karma: number;
  level: string;
  nextLevel: string | null;
  levelProgress: number;
  todayCount: number;
  streak: number;
  goalMetToday: boolean;
  week: KarmaDay[];
  totalCompleted: number;
};

export const KARMA_LEVELS: { name: string; minKarma: number }[] = [
  { name: "Beginner", minKarma: 0 },
  { name: "Novice", minKarma: 100 },
  { name: "Intermediate", minKarma: 250 },
  { name: "Professional", minKarma: 500 },
  { name: "Expert", minKarma: 1000 },
  { name: "Master", minKarma: 2500 },
  { name: "Grandmaster", minKarma: 5000 },
  { name: "Enlightened", minKarma: 10000 },
];

const POINTS_PER_TASK = 5;
const GOAL_BONUS = 10;
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export function clampDailyGoal(value: unknown): number {
  if (value === null || value === undefined || value === "") return 5;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.min(30, Math.max(1, Math.round(n)));
}

export function computeKarma(tasks: KarmaTask[], dailyGoal: number, now?: Date): KarmaStats {
  const goal = clampDailyGoal(dailyGoal);
  const today = now ?? new Date();
  const todayKey = localDateKey(today);

  // Bucket completions into local-date day counts. A task counts when it is
  // completed OR carries a completion stamp (recurring tasks stay open but
  // stamp completedAt each time they are checked off).
  const dayCounts = new Map<string, number>();
  let totalCompleted = 0;
  for (const task of tasks) {
    if (!task.completed && !task.completedAt) continue;
    totalCompleted += 1;
    if (!task.completedAt) continue;
    const done = new Date(task.completedAt);
    if (Number.isNaN(done.getTime())) continue;
    const key = localDateKey(done);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }

  // Karma: per-task points plus a bonus for each day the goal was met.
  let karma = totalCompleted * POINTS_PER_TASK;
  for (const count of dayCounts.values()) {
    if (count >= goal) karma += GOAL_BONUS;
  }

  // Level and progress toward the next one.
  let levelIndex = 0;
  for (let i = 0; i < KARMA_LEVELS.length; i++) {
    if (karma >= KARMA_LEVELS[i].minKarma) levelIndex = i;
  }
  const level = KARMA_LEVELS[levelIndex];
  const next = levelIndex + 1 < KARMA_LEVELS.length ? KARMA_LEVELS[levelIndex + 1] : null;
  const levelProgress = next
    ? Math.min(100, Math.round(((karma - level.minKarma) / (next.minKarma - level.minKarma)) * 100))
    : 100;

  const todayCount = dayCounts.get(todayKey) ?? 0;
  const goalMetToday = todayCount >= goal;

  // Streak: consecutive goal-met days ending today (or yesterday if today is pending).
  let streak = 0;
  let offset = goalMetToday ? 0 : -1;
  while ((dayCounts.get(localDateKey(shiftDays(today, offset))) ?? 0) >= goal) {
    streak += 1;
    offset -= 1;
  }

  // Last 7 days, oldest first.
  const week: KarmaDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = shiftDays(today, -i);
    const key = localDateKey(day);
    const count = dayCounts.get(key) ?? 0;
    week.push({
      label: WEEKDAY_LETTERS[day.getDay()],
      date: key,
      count,
      goalMet: count >= goal,
      isToday: key === todayKey,
    });
  }

  return {
    karma,
    level: level.name,
    nextLevel: next ? next.name : null,
    levelProgress,
    todayCount,
    streak,
    goalMetToday,
    week,
    totalCompleted,
  };
}
