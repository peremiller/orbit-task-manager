export type FocusTimerStatus = "idle" | "running" | "paused";
export type FocusHistoryStatus = "completed" | "stopped";

export type FocusTimerState = {
  status: FocusTimerStatus;
  sessionId: string | null;
  taskId: number | null;
  taskTitle: string;
  startedAt: string | null;
  runStartedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
  focusedSeconds: number;
  targetSeconds: number;
};

export type FocusHistoryEntry = {
  id: string;
  taskId: number | null;
  taskTitle: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  targetSeconds: number;
  status: FocusHistoryStatus;
};

export const DEFAULT_FOCUS_SECONDS = 25 * 60;
const MAX_FOCUS_SECONDS = 24 * 60 * 60;
const MAX_HISTORY_ENTRIES = 500;

export const DEFAULT_FOCUS_TIMER: FocusTimerState = {
  status: "idle",
  sessionId: null,
  taskId: null,
  taskTitle: "",
  startedAt: null,
  runStartedAt: null,
  endsAt: null,
  remainingSeconds: DEFAULT_FOCUS_SECONDS,
  focusedSeconds: 0,
  targetSeconds: DEFAULT_FOCUS_SECONDS,
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function safeSeconds(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_FOCUS_SECONDS
    ? value
    : fallback;
}

export function normalizeFocusTimer(value: unknown): FocusTimerState {
  if (!value || typeof value !== "object") return { ...DEFAULT_FOCUS_TIMER };
  const timer = value as Partial<FocusTimerState>;
  if (timer.status !== "idle" && timer.status !== "running" && timer.status !== "paused") {
    return { ...DEFAULT_FOCUS_TIMER };
  }

  const remainingSeconds = safeSeconds(timer.remainingSeconds, DEFAULT_FOCUS_SECONDS);
  const targetSeconds = safeSeconds(timer.targetSeconds, Math.max(remainingSeconds, DEFAULT_FOCUS_SECONDS));
  const focusedSeconds = safeSeconds(timer.focusedSeconds);
  if (timer.status === "idle") {
    return {
      ...DEFAULT_FOCUS_TIMER,
      remainingSeconds,
      targetSeconds: Math.max(targetSeconds, remainingSeconds),
    };
  }

  if (
    typeof timer.sessionId !== "string"
    || !timer.sessionId
    || (timer.taskId !== null && typeof timer.taskId !== "number")
    || typeof timer.taskTitle !== "string"
    || !timer.taskTitle.trim()
    || !isIsoDate(timer.startedAt)
  ) {
    return { ...DEFAULT_FOCUS_TIMER };
  }

  if (timer.status === "running" && (!isIsoDate(timer.runStartedAt) || !isIsoDate(timer.endsAt))) {
    return { ...DEFAULT_FOCUS_TIMER };
  }

  return {
    status: timer.status,
    sessionId: timer.sessionId,
    taskId: timer.taskId ?? null,
    taskTitle: timer.taskTitle.trim().slice(0, 240),
    startedAt: timer.startedAt,
    runStartedAt: timer.status === "running" ? timer.runStartedAt! : null,
    endsAt: timer.status === "running" ? timer.endsAt! : null,
    remainingSeconds,
    focusedSeconds,
    targetSeconds: Math.max(targetSeconds, remainingSeconds + focusedSeconds),
  };
}

export function normalizeFocusHistory(value: unknown): FocusHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: FocusHistoryEntry[] = [];
  const seenIds = new Set<string>();

  for (const rawEntry of value.slice(0, MAX_HISTORY_ENTRIES)) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const entry = rawEntry as Partial<FocusHistoryEntry>;
    if (
      typeof entry.id !== "string"
      || !entry.id
      || seenIds.has(entry.id)
      || (entry.taskId !== null && typeof entry.taskId !== "number")
      || typeof entry.taskTitle !== "string"
      || !entry.taskTitle.trim()
      || !isIsoDate(entry.startedAt)
      || !isIsoDate(entry.endedAt)
      || (entry.status !== "completed" && entry.status !== "stopped")
    ) continue;

    seenIds.add(entry.id);
    entries.push({
      id: entry.id,
      taskId: entry.taskId ?? null,
      taskTitle: entry.taskTitle.trim().slice(0, 240),
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationSeconds: safeSeconds(entry.durationSeconds),
      targetSeconds: safeSeconds(entry.targetSeconds, DEFAULT_FOCUS_SECONDS),
      status: entry.status,
    });
  }

  return entries;
}

export function focusSecondsLeft(timer: FocusTimerState, now = Date.now()) {
  if (timer.status !== "running" || !timer.endsAt) return timer.remainingSeconds;
  return Math.max(0, Math.ceil((Date.parse(timer.endsAt) - now) / 1000));
}

export function startFocusTimer(task: { id: number; title: string }, seconds: number, now = Date.now(), sessionId = crypto.randomUUID()): FocusTimerState {
  const safeDuration = Math.min(MAX_FOCUS_SECONDS, Math.max(1, Math.round(seconds)));
  const timestamp = new Date(now).toISOString();
  return {
    status: "running",
    sessionId,
    taskId: task.id,
    taskTitle: task.title,
    startedAt: timestamp,
    runStartedAt: timestamp,
    endsAt: new Date(now + safeDuration * 1000).toISOString(),
    remainingSeconds: safeDuration,
    focusedSeconds: 0,
    targetSeconds: safeDuration,
  };
}

export function pauseFocusTimer(timer: FocusTimerState, now = Date.now()): FocusTimerState {
  if (timer.status !== "running") return timer;
  const remainingSeconds = focusSecondsLeft(timer, now);
  const runSeconds = Math.max(0, timer.remainingSeconds - remainingSeconds);
  return {
    ...timer,
    status: "paused",
    runStartedAt: null,
    endsAt: null,
    remainingSeconds,
    focusedSeconds: Math.min(MAX_FOCUS_SECONDS, timer.focusedSeconds + runSeconds),
  };
}

export function resumeFocusTimer(timer: FocusTimerState, now = Date.now()): FocusTimerState {
  if (timer.status !== "paused" || timer.remainingSeconds <= 0) return timer;
  const timestamp = new Date(now).toISOString();
  return {
    ...timer,
    status: "running",
    runStartedAt: timestamp,
    endsAt: new Date(now + timer.remainingSeconds * 1000).toISOString(),
  };
}

export function extendFocusTimer(timer: FocusTimerState, seconds: number, now = Date.now()): FocusTimerState {
  const addedSeconds = Math.max(0, Math.round(seconds));
  if (!addedSeconds) return timer;
  const currentRemaining = focusSecondsLeft(timer, now);
  const nextRemaining = Math.min(MAX_FOCUS_SECONDS, currentRemaining + addedSeconds);
  const appliedSeconds = nextRemaining - currentRemaining;

  if (timer.status === "running") {
    return {
      ...timer,
      endsAt: new Date(now + nextRemaining * 1000).toISOString(),
      remainingSeconds: Math.min(MAX_FOCUS_SECONDS, timer.remainingSeconds + appliedSeconds),
      targetSeconds: Math.min(MAX_FOCUS_SECONDS, timer.targetSeconds + appliedSeconds),
    };
  }

  return {
    ...timer,
    remainingSeconds: nextRemaining,
    targetSeconds: Math.min(MAX_FOCUS_SECONDS, timer.targetSeconds + appliedSeconds),
  };
}

export function finishFocusTimer(timer: FocusTimerState, status: FocusHistoryStatus, now = Date.now()): FocusHistoryEntry | null {
  if (timer.status === "idle" || !timer.sessionId || !timer.startedAt || !timer.taskTitle) return null;
  const remainingSeconds = focusSecondsLeft(timer, now);
  const currentRunSeconds = timer.status === "running" ? Math.max(0, timer.remainingSeconds - remainingSeconds) : 0;
  const durationSeconds = Math.min(MAX_FOCUS_SECONDS, timer.focusedSeconds + currentRunSeconds);
  if (status === "stopped" && durationSeconds === 0) return null;

  return {
    id: timer.sessionId,
    taskId: timer.taskId,
    taskTitle: timer.taskTitle,
    startedAt: timer.startedAt,
    endedAt: new Date(now).toISOString(),
    durationSeconds,
    targetSeconds: timer.targetSeconds,
    status,
  };
}
