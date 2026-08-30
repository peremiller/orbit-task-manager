import { cookies } from "next/headers";
import { getOrbitWorkspace, normalizeScheduleWindow, saveOrbitWorkspace, type ScheduleWindow } from "../../../lib/orbit-db";
import { canEditSelectionManager, ORBIT_SESSION_COOKIE, verifyOrbitSession } from "../../../lib/orbit-auth";
import { normalizeFocusHistory, normalizeFocusTimer, type FocusHistoryEntry, type FocusTimerState } from "../../../lib/focus-timer";
import { createDefaultWorkTrackingState, normalizeWorkTracking, type WorkTrackingState } from "../../../lib/work-tracking";
import { normalizeGoals, type Goal } from "../../../lib/goals";

const MAX_BODY_BYTES = 1_000_000;
const MAX_TASKS = 2_000;
const MAX_PROJECTS = 500;
const MAX_GOALS = 250;
const MAX_FOCUS_HISTORY = 500;
const MAX_WORK_ITEMS = 1_000;
const MAX_ACTUAL_ENTRIES = 5_000;
const MAX_SPRINTS = 200;

async function authenticatedUser() {
  const cookieStore = await cookies();
  return verifyOrbitSession(cookieStore.get(ORBIT_SESSION_COOKIE)?.value);
}

export async function GET() {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const workspace = await getOrbitWorkspace(user.id);
    return Response.json({ workspace }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load Orbit workspace", error);
    return Response.json({ error: "Workspace unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const user = await authenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return Response.json({ error: "Workspace is too large" }, { status: 413 });

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return Response.json({ error: "Workspace is too large" }, { status: 413 });
    }

    const body = JSON.parse(rawBody) as { tasks?: unknown; projects?: unknown; goals?: unknown; schedule?: unknown; focusTimer?: unknown; focusHistory?: unknown; workTracking?: unknown };
    if (!Array.isArray(body.tasks) || !Array.isArray(body.projects)) {
      return Response.json({ error: "Tasks and projects must be arrays" }, { status: 400 });
    }
    if (body.tasks.length > MAX_TASKS || body.projects.length > MAX_PROJECTS) {
      return Response.json({ error: "Workspace has too many items" }, { status: 413 });
    }
    let goals: Goal[] | undefined;
    if (body.goals !== undefined) {
      if (!Array.isArray(body.goals) || body.goals.length > MAX_GOALS) {
        return Response.json({ error: "Goals are invalid" }, { status: 400 });
      }
      goals = normalizeGoals(body.goals);
      if (goals.length !== body.goals.length) {
        return Response.json({ error: "Goals contain invalid entries" }, { status: 400 });
      }
    }
    let schedule: ScheduleWindow | undefined;
    if (body.schedule !== undefined) {
      schedule = normalizeScheduleWindow(body.schedule) ?? undefined;
      if (!schedule) return Response.json({ error: "Schedule start and end times are invalid" }, { status: 400 });
    }
    let focusTimer: FocusTimerState | undefined;
    if (body.focusTimer !== undefined) {
      focusTimer = normalizeFocusTimer(body.focusTimer);
      if (focusTimer.status === "idle" && (body.focusTimer as { status?: unknown })?.status !== "idle") {
        return Response.json({ error: "Focus timer is invalid" }, { status: 400 });
      }
    }
    let focusHistory: FocusHistoryEntry[] | undefined;
    if (body.focusHistory !== undefined) {
      if (!Array.isArray(body.focusHistory) || body.focusHistory.length > MAX_FOCUS_HISTORY) {
        return Response.json({ error: "Focus history is invalid" }, { status: 400 });
      }
      focusHistory = normalizeFocusHistory(body.focusHistory);
      if (focusHistory.length !== body.focusHistory.length) {
        return Response.json({ error: "Focus history contains invalid entries" }, { status: 400 });
      }
    }

    let workTracking: WorkTrackingState | undefined;
    if (body.workTracking !== undefined) {
      const candidate = body.workTracking as { workItems?: unknown; actualEntries?: unknown; sprints?: unknown };
      if (!candidate || !Array.isArray(candidate.workItems) || !Array.isArray(candidate.actualEntries) || (candidate.sprints !== undefined && !Array.isArray(candidate.sprints))) {
        return Response.json({ error: "Work tracking data is invalid" }, { status: 400 });
      }
      if (candidate.workItems.length > MAX_WORK_ITEMS || candidate.actualEntries.length > MAX_ACTUAL_ENTRIES || (Array.isArray(candidate.sprints) && candidate.sprints.length > MAX_SPRINTS)) {
        return Response.json({ error: "Work tracking data has too many items" }, { status: 413 });
      }
      workTracking = normalizeWorkTracking(body.workTracking);
      if (!canEditSelectionManager(user)) {
        const existingWorkspace = await getOrbitWorkspace(user.id);
        const existingTracking = existingWorkspace?.workTracking ?? createDefaultWorkTrackingState();
        const selectionChanged = JSON.stringify(workTracking.options) !== JSON.stringify(existingTracking.options)
          || JSON.stringify(workTracking.sprints) !== JSON.stringify(existingTracking.sprints);
        if (selectionChanged) {
          return Response.json({ error: "Owner or admin access is required to edit Selection Manager" }, { status: 403 });
        }
      }
    }

    const workspace = await saveOrbitWorkspace(user.id, body.tasks, body.projects, goals, schedule, focusTimer, focusHistory, workTracking);
    return Response.json({ workspace }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Failed to save Orbit workspace", error);
    return Response.json({ error: "Workspace could not be saved" }, { status: 503 });
  }
}
