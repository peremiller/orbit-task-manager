export const GOAL_COLORS = ["#2457ff", "#7c5cff", "#13a57a", "#e2782c", "#d34872", "#0891b2", "#7a9c12", "#8b5cf6"];

export type Goal = {
  id: string;
  title: string;
  description: string;
  color: string;
  targetDate: string;
  createdAt: string;
};

const GOAL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function goalSlug(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "goal";
}

export function uniqueGoalId(title: string, goals: Pick<Goal, "id">[]) {
  const base = goalSlug(title);
  const ids = new Set(goals.map((goal) => goal.id));
  if (!ids.has(base)) return base;

  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function normalizeGoals(value: unknown): Goal[] {
  if (!Array.isArray(value)) return [];
  const goals: Goal[] = [];
  const ids = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Partial<Goal>;
    const id = typeof candidate.id === "string" ? candidate.id.trim().toLowerCase() : "";
    const title = typeof candidate.title === "string" ? candidate.title.trim().slice(0, 120) : "";
    if (!id || !title || !GOAL_ID_PATTERN.test(id) || ids.has(id)) continue;

    goals.push({
      id,
      title,
      description: typeof candidate.description === "string" ? candidate.description.trim().slice(0, 500) : "",
      color: typeof candidate.color === "string" && COLOR_PATTERN.test(candidate.color) ? candidate.color : GOAL_COLORS[goals.length % GOAL_COLORS.length],
      targetDate: typeof candidate.targetDate === "string" && DATE_PATTERN.test(candidate.targetDate) ? candidate.targetDate : "",
      createdAt: typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt)) ? candidate.createdAt : new Date(0).toISOString(),
    });
    ids.add(id);
  }

  return goals;
}
