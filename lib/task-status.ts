export type TaskStatus = "todo" | "in-progress" | "done" | "na";
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { todo: "Not Started", "in-progress": "In Progress", done: "Complete", na: "N/A" };

type TaskState = { completed: boolean; status?: string };
export function isActionableTask(task: TaskState) {
  return !task.completed && task.status !== "done" && task.status !== "na";
}

type StatusTask = { id: number; status: TaskStatus; completed: boolean; completedAt?: string; kanbanColumnId?: string };

/** N/A retains the record without recording a completion or creating a recurrence. */
export function changeTaskStatus<T extends StatusTask>(tasks: T[], id: number, status: TaskStatus, options: { now?: string; columnId?: string; nextOccurrence?: (task: T) => T | null } = {}): T[] {
  const target = tasks.find(task => task.id === id);
  if (!target) return tasks;
  const completing = status === "done" && !target.completed;
  const now = options.now ?? new Date().toISOString();
  const updated = tasks.map(task => task.id === id ? {
    ...task,
    status,
    completed: status === "done",
    completedAt: status === "done" ? (completing ? now : task.completedAt ?? now) : undefined,
    kanbanColumnId: options.columnId,
  } : task);
  const next = completing ? options.nextOccurrence?.(target) : null;
  return next ? [next, ...updated] : updated;
}
