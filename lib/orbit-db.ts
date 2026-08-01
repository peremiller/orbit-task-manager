import { neon } from "@neondatabase/serverless";

export type ScheduleWindow = {
  startTime: string;
  endTime: string;
};

export const DEFAULT_TODAY_SCHEDULE: ScheduleWindow = { startTime: "09:00", endTime: "17:00" };
const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type OrbitWorkspace = {
  tasks: unknown[];
  projects: unknown[];
  schedule: ScheduleWindow;
  revision: number;
  updatedAt: string;
};

type WorkspaceRow = {
  tasks: unknown[];
  projects: unknown[];
  schedule: unknown;
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

async function ensureScheduleColumn(sql: ReturnType<typeof database>) {
  await sql`
    ALTER TABLE orbit_workspaces
    ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL
    DEFAULT '{"startTime":"09:00","endTime":"17:00"}'::jsonb
  `;
}

function toWorkspace(row: WorkspaceRow): OrbitWorkspace {
  return {
    tasks: row.tasks,
    projects: row.projects,
    schedule: normalizeScheduleWindow(row.schedule) ?? DEFAULT_TODAY_SCHEDULE,
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getOrbitWorkspace(userId: string): Promise<OrbitWorkspace | null> {
  const sql = database();
  await ensureScheduleColumn(sql);
  const rows = await sql`
    SELECT tasks, projects, schedule, revision, updated_at
    FROM orbit_workspaces
    WHERE user_id = ${userId}
    LIMIT 1
  ` as WorkspaceRow[];
  return rows[0] ? toWorkspace(rows[0]) : null;
}

export async function saveOrbitWorkspace(userId: string, tasks: unknown[], projects: unknown[], schedule?: ScheduleWindow): Promise<OrbitWorkspace> {
  const sql = database();
  await ensureScheduleColumn(sql);
  const scheduleJson = schedule ? JSON.stringify(schedule) : null;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS orbit_workspace_history (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        tasks jsonb NOT NULL,
        projects jsonb NOT NULL,
        schedule jsonb NOT NULL DEFAULT '{"startTime":"09:00","endTime":"17:00"}'::jsonb,
        revision bigint NOT NULL,
        workspace_updated_at timestamptz NOT NULL,
        archived_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      ALTER TABLE orbit_workspace_history
      ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL
      DEFAULT '{"startTime":"09:00","endTime":"17:00"}'::jsonb
    `;
    await sql`
      INSERT INTO orbit_workspace_history (user_id, tasks, projects, schedule, revision, workspace_updated_at)
      SELECT user_id, tasks, projects, schedule, revision, updated_at
      FROM orbit_workspaces
      WHERE user_id = ${userId}
    `;
  } catch (error) {
    console.error("Failed to archive Orbit workspace revision", error);
  }
  const rows = await sql`
    INSERT INTO orbit_workspaces (user_id, tasks, projects, schedule)
    VALUES (${userId}, ${JSON.stringify(tasks)}::jsonb, ${JSON.stringify(projects)}::jsonb, COALESCE(${scheduleJson}::jsonb, '{"startTime":"09:00","endTime":"17:00"}'::jsonb))
    ON CONFLICT (user_id) DO UPDATE SET
      tasks = EXCLUDED.tasks,
      projects = EXCLUDED.projects,
      schedule = COALESCE(${scheduleJson}::jsonb, orbit_workspaces.schedule),
      revision = orbit_workspaces.revision + 1,
      updated_at = now()
    RETURNING tasks, projects, schedule, revision, updated_at
  ` as WorkspaceRow[];
  if (!rows[0]) throw new Error("Workspace save did not return a row");
  return toWorkspace(rows[0]);
}
