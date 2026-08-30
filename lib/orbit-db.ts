import { neon } from "@neondatabase/serverless";
import {
  DEFAULT_FOCUS_TIMER,
  normalizeFocusHistory,
  normalizeFocusTimer,
  type FocusHistoryEntry,
  type FocusTimerState,
} from "./focus-timer";
import { normalizeWorkTracking, type WorkTrackingState } from "./work-tracking";
import { normalizeGoals, type Goal } from "./goals";

export type ScheduleWindow = {
  startTime: string;
  endTime: string;
};

export const DEFAULT_TODAY_SCHEDULE: ScheduleWindow = { startTime: "08:00", endTime: "18:00" };
const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type OrbitWorkspace = {
  tasks: unknown[];
  projects: unknown[];
  goals: Goal[];
  schedule: ScheduleWindow;
  focusTimer: FocusTimerState;
  focusHistory: FocusHistoryEntry[];
  workTracking: WorkTrackingState;
  revision: number;
  updatedAt: string;
};

type WorkspaceRow = {
  tasks: unknown[];
  projects: unknown[];
  goals: unknown;
  schedule: unknown;
  focus_timer: unknown;
  focus_history: unknown;
  work_tracking: unknown;
  revision: string | number;
  updated_at: Date | string;
};

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return neon(connectionString);
}

function timeValueToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

export function normalizeScheduleWindow(value: unknown): ScheduleWindow | null {
  if (!value || typeof value !== "object") return null;
  const schedule = value as Partial<ScheduleWindow>;
  if (typeof schedule.startTime !== "string" || typeof schedule.endTime !== "string") return null;
  if (!TIME_VALUE_PATTERN.test(schedule.startTime) || !TIME_VALUE_PATTERN.test(schedule.endTime)) return null;
  if (timeValueToMinutes(schedule.startTime) >= timeValueToMinutes(schedule.endTime)) return null;
  return { startTime: schedule.startTime, endTime: schedule.endTime };
}

async function ensureWorkspaceColumns(sql: ReturnType<typeof database>) {
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL
    DEFAULT '[]'::jsonb
  `;
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL
    DEFAULT '{"startTime":"08:00","endTime":"18:00"}'::jsonb
  `;
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS focus_timer jsonb NOT NULL
    DEFAULT '{"status":"idle","sessionId":null,"taskId":null,"taskTitle":"","startedAt":null,"runStartedAt":null,"endsAt":null,"remainingSeconds":1500,"focusedSeconds":0,"targetSeconds":1500}'::jsonb
  `;
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS focus_history jsonb NOT NULL
    DEFAULT '[]'::jsonb
  `;
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS work_tracking jsonb NOT NULL
    DEFAULT '{"workItems":[],"actualEntries":[],"selectedEffortWeeks":[],"timesheetWeek":""}'::jsonb
  `;
}

function toWorkspace(row: WorkspaceRow): OrbitWorkspace {
  return {
    tasks: row.tasks,
    projects: row.projects,
    goals: normalizeGoals(row.goals),
    schedule: normalizeScheduleWindow(row.schedule) ?? DEFAULT_TODAY_SCHEDULE,
    focusTimer: normalizeFocusTimer(row.focus_timer),
    focusHistory: normalizeFocusHistory(row.focus_history),
    workTracking: normalizeWorkTracking(row.work_tracking),
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getOrbitWorkspace(userId: string): Promise<OrbitWorkspace | null> {
  const sql = database();
  await ensureWorkspaceColumns(sql);
  const rows = await sql`
    SELECT tasks, projects, goals, schedule, focus_timer, focus_history, work_tracking, revision, updated_at
    FROM orbit_workspaces
    WHERE user_id = ${userId}
    LIMIT 1
  ` as WorkspaceRow[];
  return rows[0] ? toWorkspace(rows[0]) : null;
}

export async function saveOrbitWorkspace(
  userId: string,
  tasks: unknown[],
  projects: unknown[],
  goals?: Goal[],
  schedule?: ScheduleWindow,
  focusTimer?: FocusTimerState,
  focusHistory?: FocusHistoryEntry[],
  workTracking?: WorkTrackingState,
): Promise<OrbitWorkspace> {
  const sql = database();
  await ensureWorkspaceColumns(sql);
  const goalsJson = goals ? JSON.stringify(goals) : null;
  const scheduleJson = schedule ? JSON.stringify(schedule) : null;
  const focusTimerJson = focusTimer ? JSON.stringify(focusTimer) : null;
  const focusHistoryJson = focusHistory ? JSON.stringify(focusHistory) : null;
  const workTrackingJson = workTracking ? JSON.stringify(workTracking) : null;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS orbit_workspace_history (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        tasks jsonb NOT NULL,
        projects jsonb NOT NULL,
        goals jsonb NOT NULL DEFAULT '[]'::jsonb,
        schedule jsonb NOT NULL DEFAULT '{"startTime":"08:00","endTime":"18:00"}'::jsonb,
        focus_timer jsonb NOT NULL DEFAULT '{"status":"idle","sessionId":null,"taskId":null,"taskTitle":"","startedAt":null,"runStartedAt":null,"endsAt":null,"remainingSeconds":1500,"focusedSeconds":0,"targetSeconds":1500}'::jsonb,
        focus_history jsonb NOT NULL DEFAULT '[]'::jsonb,
        work_tracking jsonb NOT NULL DEFAULT '{"workItems":[],"actualEntries":[],"selectedEffortWeeks":[],"timesheetWeek":""}'::jsonb,
        revision bigint NOT NULL,
        workspace_updated_at timestamptz NOT NULL,
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS goals jsonb NOT NULL
      DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL
      DEFAULT '{"startTime":"08:00","endTime":"18:00"}'::jsonb
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS focus_timer jsonb NOT NULL
      DEFAULT '{"status":"idle","sessionId":null,"taskId":null,"taskTitle":"","startedAt":null,"runStartedAt":null,"endsAt":null,"remainingSeconds":1500,"focusedSeconds":0,"targetSeconds":1500}'::jsonb
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS focus_history jsonb NOT NULL
      DEFAULT '[]'::jsonb
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS work_tracking jsonb NOT NULL
      DEFAULT '{"workItems":[],"actualEntries":[],"selectedEffortWeeks":[],"timesheetWeek":""}'::jsonb
    `;
    await sql`
      INSERT INTO orbit_workspace_history (user_id, tasks, projects, goals, schedule, focus_timer, focus_history, work_tracking, revision, workspace_updated_at)
      SELECT user_id, tasks, projects, goals, schedule, focus_timer, focus_history, work_tracking, revision, updated_at
      FROM orbit_workspaces
      WHERE user_id = ${userId}
    `;
  } catch (error) {
    console.error("Failed to archive Orbit workspace revision", error);
  }
  const rows = await sql`
    INSERT INTO orbit_workspaces (user_id, tasks, projects, goals, schedule, focus_timer, focus_history, work_tracking)
    VALUES (
      ${userId},
      ${JSON.stringify(tasks)}::jsonb,
      ${JSON.stringify(projects)}::jsonb,
      COALESCE(${goalsJson}::jsonb, '[]'::jsonb),
      COALESCE(${scheduleJson}::jsonb, '{"startTime":"08:00","endTime":"18:00"}'::jsonb),
      COALESCE(${focusTimerJson}::jsonb, ${JSON.stringify(DEFAULT_FOCUS_TIMER)}::jsonb),
      COALESCE(${focusHistoryJson}::jsonb, '[]'::jsonb),
      COALESCE(${workTrackingJson}::jsonb, '{"workItems":[],"actualEntries":[],"selectedEffortWeeks":[],"timesheetWeek":""}'::jsonb)
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tasks = EXCLUDED.tasks,
      projects = EXCLUDED.projects,
      goals = COALESCE(${goalsJson}::jsonb, orbit_workspaces.goals),
      schedule = COALESCE(${scheduleJson}::jsonb, orbit_workspaces.schedule),
      focus_timer = COALESCE(${focusTimerJson}::jsonb, orbit_workspaces.focus_timer),
      focus_history = COALESCE(${focusHistoryJson}::jsonb, orbit_workspaces.focus_history),
      work_tracking = COALESCE(${workTrackingJson}::jsonb, orbit_workspaces.work_tracking),
      revision = orbit_workspaces.revision + 1,
      updated_at = now()
    RETURNING tasks, projects, goals, schedule, focus_timer, focus_history, work_tracking, revision, updated_at
  ` as WorkspaceRow[];
  if (!rows[0]) throw new Error("Workspace save did not return a row");
  return toWorkspace(rows[0]);
}
