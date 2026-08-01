import { neon } from "@neondatabase/serverless";

export type OrbitWorkspace = {
  tasks: unknown[];
  projects: unknown[];
  revision: number;
  updatedAt: string;
};

type WorkspaceRow = {
  tasks: unknown[];
  projects: unknown[];
  revision: string | number;
  updated_at: Date | string;
};

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return neon(connectionString);
}

function toWorkspace(row: WorkspaceRow): OrbitWorkspace {
  return {
    tasks: row.tasks,
    projects: row.projects,
    revision: Number(row.revision),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getOrbitWorkspace(userId: string): Promise<OrbitWorkspace | null> {
  const sql = database();
  const rows = await sql`
    SELECT tasks, projects, revision, updated_at
    FROM orbit_workspaces
    WHERE user_id = ${userId}
    LIMIT 1
  ` as WorkspaceRow[];
  return rows[0] ? toWorkspace(rows[0]) : null;
}

export async function saveOrbitWorkspace(userId: string, tasks: unknown[], projects: unknown[]): Promise<OrbitWorkspace> {
  const sql = database();
  const rows = await sql`
    INSERT INTO orbit_workspaces (user_id, tasks, projects)
    VALUES (${userId}, ${JSON.stringify(tasks)}::jsonb, ${JSON.stringify(projects)}::jsonb)
    ON CONFLICT (user_id) DO UPDATE SET
      tasks = EXCLUDED.tasks,
      projects = EXCLUDED.projects,
      revision = orbit_workspaces.revision + 1,
      updated_at = now()
    RETURNING tasks, projects, revision, updated_at
  ` as WorkspaceRow[];
  if (!rows[0]) throw new Error("Workspace save did not return a row");
  return toWorkspace(rows[0]);
}
