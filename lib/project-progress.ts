import type { Project } from "./projects";

export type ProgressPeriod = "week" | "month" | "quarter" | "year";
export const PROGRESS_TIME_ZONE = "Asia/Manila";
export const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86_400_000;
const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: PROGRESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

export type ProgressTask = { id: number; title: string; project: string; completed: boolean; completedAt?: string };

function calendarDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : date;
}

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
export function progressToday(now = new Date()) { return manilaDate.format(now); }
export function shiftProgressDay(key: string, amount: number) {
  const date = calendarDate(key);
  if (!date) throw new Error("Choose a valid calendar date.");
  return dateKey(new Date(date.getTime() + amount * DAY_MS));
}

export function completionDateKey(value?: string): string | null {
  if (!value) return null;
  if (value.length === 10) return calendarDate(value) ? value : null;
  if (!calendarDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : manilaDate.format(date);
}

export function progressWindow(anchor: string, period: ProgressPeriod) {
  const start = calendarDate(anchor);
  if (!start) throw new Error("Choose a valid calendar date.");
  if (period === "week") start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  else if (period === "month") start.setUTCDate(1);
  else if (period === "quarter") { start.setUTCDate(1); start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3); }
  else { start.setUTCMonth(0, 1); }
  const end = new Date(start);
  if (period === "week") end.setUTCDate(end.getUTCDate() + 7);
  else if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else if (period === "quarter") end.setUTCMonth(end.getUTCMonth() + 3);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start: dateKey(start), end: dateKey(new Date(end.getTime() - DAY_MS)) };
}

export function moveProgressPeriod(anchor: string, period: ProgressPeriod, step: number) {
  const date = calendarDate(progressWindow(anchor, period).start)!;
  if (period === "week") date.setUTCDate(date.getUTCDate() + step * 7);
  else if (period === "year") date.setUTCFullYear(date.getUTCFullYear() + step);
  else date.setUTCMonth(date.getUTCMonth() + step * (period === "quarter" ? 3 : 1));
  return dateKey(date);
}

export function progressDateLabel(key: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-PH", { ...options, timeZone: "UTC" }).format(calendarDate(key)!);
}

export function progressProjects(tasks: ProgressTask[], projects: Project[]): Project[] {
  const known = new Set(projects.map((project) => project.name));
  const unlisted = [...new Set(tasks.map((task) => task.project))].filter((name) => !known.has(name));
  return [...projects, ...unlisted.map((name) => ({ id: `__unlisted__:${name}`, name, color: "#737985", description: "Tasks without a matching project entry" }))];
}

export function completionLevel(count: number) { return count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4; }

export function buildProjectProgress<T extends ProgressTask>(tasks: T[], projects: Project[], options: { period: ProgressPeriod; anchor: string; projectId?: string; status?: "all" | "active" | "disabled"; today?: string }) {
  const { period, anchor } = options;
  const today = options.today ?? progressToday();
  const window = progressWindow(anchor, period);
  const population = progressProjects(tasks, projects).filter((project) => (!options.projectId || project.id === options.projectId) && (!options.status || options.status === "all" || (options.status === "disabled" ? project.disabled : !project.disabled)));
  const names = new Set(population.map((project) => project.name));
  const scopedTasks = tasks.filter((task) => names.has(task.project));
  const dated = scopedTasks.filter((task) => task.completed).map((task) => ({ task, date: completionDateKey(task.completedAt) }));
  const undatedCompleted = dated.filter((item) => item.date === null).length;
  const completions = dated.filter((item): item is { task: T; date: string } => item.date !== null && item.date >= window.start && item.date <= window.end && item.date <= today);
  const dayCounts = new Map<string, number>();
  const weekdays = WEEKDAY_NAMES.map((label) => ({ label, count: 0 }));
  for (const item of completions) {
    dayCounts.set(item.date, (dayCounts.get(item.date) ?? 0) + 1);
    weekdays[(calendarDate(item.date)!.getUTCDay() + 6) % 7].count += 1;
  }
  const days = [];
  for (let date = window.start; date <= window.end; date = shiftProgressDay(date, 1)) days.push({ date, count: dayCounts.get(date) ?? 0, future: date > today });
  const buckets: { start: string; end: string; label: string }[] = [];
  for (let start = window.start; start <= window.end;) {
    const end = period === "year" ? progressWindow(start, "month").end : period === "quarter" ? [shiftProgressDay(start, 6), window.end].sort()[0] : start;
    buckets.push({ start, end, label: period === "year" ? progressDateLabel(start, { month: "short" }) : period === "quarter" ? progressDateLabel(start) : progressDateLabel(start, { day: "numeric" }) });
    start = shiftProgressDay(end, 1);
  }
  const rows = population.map((project) => {
    const projectTasks = scopedTasks.filter((task) => task.project === project.name);
    const periodTasks = completions.filter((item) => item.task.project === project.name);
    const done = projectTasks.filter((task) => task.completed).length;
    return { project, total: projectTasks.length, done, open: projectTasks.length - done, percent: projectTasks.length ? Math.round(done / projectTasks.length * 100) : null, periodCompleted: periodTasks.length, counts: buckets.map((bucket) => periodTasks.filter((item) => item.date >= bucket.start && item.date <= bucket.end).length) };
  });
  return { ...window, today, days, buckets, rows, weekdays, completions, undatedCompleted, totalCompleted: completions.length, activeDays: dayCounts.size, projectsProgressed: new Set(completions.map((item) => item.task.project)).size, openTasks: scopedTasks.filter((task) => !task.completed).length };
}
