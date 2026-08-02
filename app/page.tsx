"use client";

import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Cloud,
  CloudOff,
  Clock3,
  Flame,
  Folder,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LayoutGrid,
  ListFilter,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  DEFAULT_FOCUS_SECONDS,
  DEFAULT_FOCUS_TIMER,
  extendFocusTimer,
  finishFocusTimer,
  focusSecondsLeft,
  normalizeFocusHistory,
  normalizeFocusTimer,
  pauseFocusTimer,
  resumeFocusTimer,
  startFocusTimer,
  type FocusHistoryEntry,
  type FocusTimerState,
} from "@/lib/focus-timer";
import { filterTasks } from "@/lib/task-filters";
import { mergeRecoveredProjects, mergeRecoveredTasks } from "@/lib/workspace-recovery";

type Priority = "Very High" | "High" | "Medium" | "Low";
type TaskStatus = "todo" | "in-progress" | "done";
type StatusFilter = "All" | TaskStatus;
export type View = "today" | "inbox" | "upcoming" | "board" | "projects" | "analytics" | "completed";

type Task = {
  id: number;
  title: string;
  project: string;
  due: string;
  time: string;
  duration: number;
  priority: Priority;
  status: TaskStatus;
  completed: boolean;
  notes: string;
};

type Project = {
  id: string;
  name: string;
  color: string;
  description: string;
};

type ScheduleWindow = {
  startTime: string;
  endTime: string;
};

type SessionUser = {
  id: string;
  username: string;
  displayName: string;
};

type SyncStatus = "loading" | "syncing" | "synced" | "offline";

type WorkspaceResponse = {
  workspace: {
    tasks: Task[];
    projects: Project[];
    schedule: ScheduleWindow;
    focusTimer: FocusTimerState;
    focusHistory: FocusHistoryEntry[];
    revision: number;
    updatedAt: string;
  } | null;
};

const INITIAL_TASKS: Task[] = [
  { id: 1, title: "Finalize release plan", project: "Product launch", due: "Today", time: "10:00 AM", duration: 150, priority: "High", status: "in-progress", completed: false, notes: "Confirm scope, owners, and launch checkpoints." },
  { id: 2, title: "Review migration test scope", project: "Platform upgrade", due: "Today", time: "1:30 PM", duration: 105, priority: "High", status: "todo", completed: false, notes: "Validate SIT and UAT coverage with the QA leads." },
  { id: 3, title: "Prepare stakeholder update", project: "Stakeholder comms", due: "Today", time: "3:30 PM", duration: 60, priority: "Medium", status: "todo", completed: false, notes: "Summarize progress, risks, and decisions needed." },
  { id: 4, title: "Triage open accessibility findings", project: "Quality systems", due: "Today", time: "4:45 PM", duration: 45, priority: "Medium", status: "todo", completed: false, notes: "Prioritize blockers and assign remediation owners." },
  { id: 5, title: "Approve homepage copy", project: "Product launch", due: "Tomorrow", time: "9:00 AM", duration: 30, priority: "Low", status: "todo", completed: false, notes: "Final editorial pass before publishing." },
  { id: 6, title: "Map automation candidates", project: "Quality systems", due: "Tomorrow", time: "11:00 AM", duration: 90, priority: "Medium", status: "todo", completed: false, notes: "Rank by repeatability and business impact." },
  { id: 7, title: "Send retrospective notes", project: "Team operations", due: "Friday", time: "2:00 PM", duration: 30, priority: "Low", status: "done", completed: true, notes: "Share the final actions and owners." },
  { id: 8, title: "Update project health dashboard", project: "Stakeholder comms", due: "Monday", time: "10:30 AM", duration: 60, priority: "Medium", status: "todo", completed: false, notes: "Refresh delivery confidence and RAID items." },
];

const INITIAL_PROJECTS: Project[] = [
  { id: "product-launch", name: "Product launch", color: "#2457ff", description: "Coordinate every detail for a confident release." },
  { id: "platform-upgrade", name: "Platform upgrade", color: "#8f5dff", description: "Upgrade safely, without surprises." },
  { id: "quality-systems", name: "Quality systems", color: "#ff8a34", description: "Build quality into every step." },
  { id: "stakeholder-comms", name: "Stakeholder comms", color: "#13a57a", description: "Keep decisions visible and moving." },
  { id: "team-operations", name: "Team operations", color: "#e74b71", description: "Make teamwork feel effortless." },
];

const PROJECT_COLORS = ["#2457ff", "#8f5dff", "#ff8a34", "#13a57a", "#e74b71", "#0891b2", "#ca8a04", "#7c3aed"];
const DEFAULT_TODAY_SCHEDULE: ScheduleWindow = { startTime: "08:00", endTime: "18:00" };
const LEGACY_TODAY_SCHEDULE: ScheduleWindow = { startTime: "09:00", endTime: "17:00" };
const TIME_VALUE_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const VIEW_TITLES: Record<View, { eyebrow: string; title: string; description: string }> = {
  today: { eyebrow: "", title: "Good morning, AJ", description: "Protect your attention. Move the work that matters." },
  inbox: { eyebrow: "Capture first, organize later", title: "Inbox", description: "Loose ends and new ideas, ready to be clarified." },
  upcoming: { eyebrow: "The week ahead", title: "Upcoming", description: "A calm view of what is coming and when." },
  board: { eyebrow: "Flow of work", title: "Board", description: "Move tasks from intention to done." },
  projects: { eyebrow: "Work with a purpose", title: "Projects", description: "Every active outcome, in one clear place." },
  analytics: { eyebrow: "Your momentum", title: "Insights", description: "See how focus compounds over time." },
  completed: { eyebrow: "Progress worth noticing", title: "Completed", description: "A record of what you moved forward." },
};

const VIEW_PATHS: Record<View, string> = {
  today: "/today",
  inbox: "/inbox",
  upcoming: "/upcoming",
  board: "/board",
  projects: "/projects",
  analytics: "/insights",
  completed: "/completed",
};

const emptyDraft = {
  title: "",
  project: "Product launch",
  due: "Today",
  time: "9:00 AM",
  duration: 30,
  priority: "Medium" as Priority,
  notes: "",
};

const emptyProjectDraft = {
  name: "",
  description: "",
  color: PROJECT_COLORS[0],
};

function projectSlug(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "project";
}

function uniqueProjectId(name: string, projects: Project[]) {
  const base = projectSlug(name);
  const projectIds = new Set(projects.map((project) => project.id));
  if (!projectIds.has(base)) return base;

  let suffix = 2;
  while (projectIds.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function priorityClass(priority: Priority) {
  return priority.toLowerCase().replaceAll(" ", "-");
}

function timeLabel(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function timeOfDayGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function currentTimeMs() {
  return Date.now();
}

function timeValueToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60) + minutes;
}

function isScheduleWindow(value: unknown): value is ScheduleWindow {
  if (!value || typeof value !== "object") return false;
  const schedule = value as Partial<ScheduleWindow>;
  return typeof schedule.startTime === "string"
    && typeof schedule.endTime === "string"
    && TIME_VALUE_PATTERN.test(schedule.startTime)
    && TIME_VALUE_PATTERN.test(schedule.endTime)
    && timeValueToMinutes(schedule.startTime) < timeValueToMinutes(schedule.endTime);
}

function formatScheduleTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  const hour = hours % 12 || 12;
  const suffix = hours < 12 ? "AM" : "PM";
  return `${hour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${suffix}`;
}

function scheduleTimeLabels(schedule: ScheduleWindow) {
  const start = timeValueToMinutes(schedule.startTime);
  const end = timeValueToMinutes(schedule.endTime);
  return Array.from({ length: 6 }, (_, index) => {
    const point = Math.round(start + ((end - start) * index) / 5);
    const hours = Math.floor(point / 60).toString().padStart(2, "0");
    const minutes = (point % 60).toString().padStart(2, "0");
    return formatScheduleTime(`${hours}:${minutes}`);
  });
}

function accountStorageKey(kind: "tasks" | "projects" | "schedule" | "focus-timer" | "focus-history", userId: string) {
  return `orbit-${kind}-v1:${userId}`;
}

function userInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "AJ";
}

async function saveWorkspace(tasks: Task[], projects: Project[], schedule: ScheduleWindow, focusTimer: FocusTimerState, focusHistory: FocusHistoryEntry[]) {
  const response = await fetch("/api/workspace", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks, projects, schedule, focusTimer, focusHistory }),
  });
  if (!response.ok) throw new Error("Workspace save failed");
  return response.json() as Promise<WorkspaceResponse>;
}

export default function Home({ initialView = "today", initialProjectId = null }: { initialView?: View; initialProjectId?: string | null }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [todaySchedule, setTodaySchedule] = useState<ScheduleWindow>(DEFAULT_TODAY_SCHEDULE);
  const [activeView, setActiveView] = useState<View>(initialView);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"All" | Priority>("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [dueFilter, setDueFilter] = useState("All");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectDraft, setNewProjectDraft] = useState(emptyProjectDraft);
  const [projectCreateError, setProjectCreateError] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [focusPickerOpen, setFocusPickerOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusTask, setFocusTask] = useState<Task | null>(INITIAL_TASKS[0]);
  const [focusTimer, setFocusTimer] = useState<FocusTimerState>({ ...DEFAULT_FOCUS_TIMER });
  const [focusHistory, setFocusHistory] = useState<FocusHistoryEntry[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [toast, setToast] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [localDateLabel, setLocalDateLabel] = useState("");
  const [localGreeting, setLocalGreeting] = useState("Good morning");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [syncRetry, setSyncRetry] = useState(0);
  const hydrated = useRef(false);
  const lastSyncedPayload = useRef("");
  const syncWasOffline = useRef(false);
  const serverRevision = useRef(0);
  const completingSession = useRef<string | null>(null);
  const latestWorkspace = useRef({ tasks, projects, schedule: todaySchedule, focusTimer, focusHistory });

  useEffect(() => {
    latestWorkspace.current = { tasks, projects, schedule: todaySchedule, focusTimer, focusHistory };
  }, [focusHistory, focusTimer, projects, tasks, todaySchedule]);

  useEffect(() => {
    function updateLocalTime() {
      const now = new Date();
      setLocalDateLabel(new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }).format(now));
      setLocalGreeting(timeOfDayGreeting(now));
    }

    updateLocalTime();
    const timer = window.setInterval(updateLocalTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unauthorized");
        return response.json() as Promise<{ user: SessionUser }>;
      })
      .then(({ user }) => {
        if (active) setSessionUser(user);
      })
      .catch(() => {
        if (active) window.location.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`);
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!sessionUser) return;
    const user = sessionUser;
    let active = true;
    hydrated.current = false;

    async function hydrateWorkspace() {
      const taskKey = accountStorageKey("tasks", user.id);
      const projectKey = accountStorageKey("projects", user.id);
      const scheduleKey = accountStorageKey("schedule", user.id);
      const focusTimerKey = accountStorageKey("focus-timer", user.id);
      const focusHistoryKey = accountStorageKey("focus-history", user.id);
      let cachedTasks: Task[] | null = null;
      let cachedProjects: Project[] | null = null;
      let cachedSchedule: ScheduleWindow | null = null;
      let cachedFocusTimer: FocusTimerState = { ...DEFAULT_FOCUS_TIMER };
      let cachedFocusHistory: FocusHistoryEntry[] = [];
      let legacyTasksBackup: Task[] = [];
      let legacyProjectsBackup: Project[] = [];
      let legacyRecoveryComplete = false;
      let hasCachedWorkspace = false;
      const recoveryKey = `orbit-legacy-recovery-v1:${user.id}`;
      const scheduleMigrationKey = `orbit-schedule-10-hour-v1:${user.id}`;
      let scheduleMigrationComplete = false;

      try {
        const legacyTasks = user.id === "aj-miller" ? window.localStorage.getItem("orbit-tasks-v1") : null;
        const legacyProjects = user.id === "aj-miller" ? window.localStorage.getItem("orbit-projects-v1") : null;
        const storedTasks = window.localStorage.getItem(taskKey) ?? legacyTasks;
        const storedProjects = window.localStorage.getItem(projectKey) ?? legacyProjects;
        const storedSchedule = window.localStorage.getItem(scheduleKey);
        const storedFocusTimer = window.localStorage.getItem(focusTimerKey);
        const storedFocusHistory = window.localStorage.getItem(focusHistoryKey);
        hasCachedWorkspace = Boolean(storedTasks || storedProjects || storedSchedule || storedFocusTimer || storedFocusHistory);
        if (storedTasks) {
          const parsedTasks = JSON.parse(storedTasks);
          if (Array.isArray(parsedTasks)) cachedTasks = parsedTasks;
        }
        if (legacyTasks) {
          const parsedLegacyTasks = JSON.parse(legacyTasks);
          if (Array.isArray(parsedLegacyTasks)) legacyTasksBackup = parsedLegacyTasks;
        }
        if (storedProjects) {
          const parsedProjects = JSON.parse(storedProjects);
          if (Array.isArray(parsedProjects)) cachedProjects = parsedProjects;
        }
        if (storedSchedule) {
          const parsedSchedule = JSON.parse(storedSchedule);
          if (isScheduleWindow(parsedSchedule)) cachedSchedule = parsedSchedule;
        }
        if (storedFocusTimer) cachedFocusTimer = normalizeFocusTimer(JSON.parse(storedFocusTimer));
        if (storedFocusHistory) cachedFocusHistory = normalizeFocusHistory(JSON.parse(storedFocusHistory));
        if (legacyProjects) {
          const parsedLegacyProjects = JSON.parse(legacyProjects);
          if (Array.isArray(parsedLegacyProjects)) legacyProjectsBackup = parsedLegacyProjects;
        }
        legacyRecoveryComplete = window.localStorage.getItem(recoveryKey) === "complete";
        scheduleMigrationComplete = window.localStorage.getItem(scheduleMigrationKey) === "complete";
        if (!window.localStorage.getItem(taskKey) && legacyTasks) window.localStorage.setItem(taskKey, legacyTasks);
        if (!window.localStorage.getItem(projectKey) && legacyProjects) window.localStorage.setItem(projectKey, legacyProjects);
      } catch {
        // Cloud storage can still load when the browser cache is unavailable.
      }

      let nextTasks = cachedTasks ?? INITIAL_TASKS;
      let nextProjects = cachedProjects ?? INITIAL_PROJECTS;
      let nextSchedule = cachedSchedule ?? DEFAULT_TODAY_SCHEDULE;
      let nextFocusTimer = cachedFocusTimer;
      let nextFocusHistory = cachedFocusHistory;
      let status: SyncStatus = "offline";
      let recoveredLegacyWorkspace = false;
      let migratedTenHourSchedule = false;

      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok) throw new Error("Workspace load failed");
        if (response.headers.get("X-Orbit-Offline") === "true") throw new Error("Using offline workspace cache");
        const { workspace } = await response.json() as WorkspaceResponse;
        if (workspace) {
          nextTasks = Array.isArray(workspace.tasks) ? workspace.tasks : INITIAL_TASKS;
          nextProjects = Array.isArray(workspace.projects) ? workspace.projects : INITIAL_PROJECTS;
          nextSchedule = isScheduleWindow(workspace.schedule) ? workspace.schedule : DEFAULT_TODAY_SCHEDULE;
          nextFocusTimer = normalizeFocusTimer(workspace.focusTimer);
          nextFocusHistory = normalizeFocusHistory(workspace.focusHistory);
          serverRevision.current = workspace.revision;
        } else if (hasCachedWorkspace) {
          const saved = await saveWorkspace(nextTasks, nextProjects, nextSchedule, nextFocusTimer, nextFocusHistory);
          serverRevision.current = saved.workspace?.revision ?? 0;
        }

        if (!scheduleMigrationComplete && nextSchedule.startTime === LEGACY_TODAY_SCHEDULE.startTime && nextSchedule.endTime === LEGACY_TODAY_SCHEDULE.endTime) {
          nextSchedule = DEFAULT_TODAY_SCHEDULE;
          migratedTenHourSchedule = true;
          window.localStorage.setItem(scheduleMigrationKey, "complete");
        }

        if (!legacyRecoveryComplete && user.id === "aj-miller" && (legacyTasksBackup.length || legacyProjectsBackup.length)) {
          const recoveredTasks = mergeRecoveredTasks(nextTasks, legacyTasksBackup);
          const recoveredProjects = mergeRecoveredProjects(nextProjects, legacyProjectsBackup);
          recoveredLegacyWorkspace = JSON.stringify(recoveredTasks) !== JSON.stringify(nextTasks)
            || JSON.stringify(recoveredProjects) !== JSON.stringify(nextProjects);
          nextTasks = recoveredTasks;
          nextProjects = recoveredProjects;
          if (recoveredLegacyWorkspace) {
            const saved = await saveWorkspace(nextTasks, nextProjects, nextSchedule, nextFocusTimer, nextFocusHistory);
            serverRevision.current = saved.workspace?.revision ?? serverRevision.current;
          }
          window.localStorage.setItem(recoveryKey, "complete");
        }
        status = "synced";
      } catch {
        status = "offline";
      }

      if (!active) return;
      setTasks(nextTasks);
      setProjects(nextProjects);
      setTodaySchedule(nextSchedule);
      setFocusTimer(nextFocusTimer);
      setFocusHistory(nextFocusHistory);
      if (recoveredLegacyWorkspace) {
        setToast("Recovered your earlier local tasks and projects, including completion status.");
      }
      setFocusTask((current) => nextTasks.find((task) => task.id === nextFocusTimer.taskId && !task.completed) ?? nextTasks.find((task) => task.id === current?.id && !task.completed) ?? nextTasks.find((task) => !task.completed) ?? null);
      lastSyncedPayload.current = status === "synced" && !migratedTenHourSchedule
        ? JSON.stringify({ tasks: nextTasks, projects: nextProjects, schedule: nextSchedule, focusTimer: nextFocusTimer, focusHistory: nextFocusHistory })
        : "";
      try {
        window.localStorage.setItem(taskKey, JSON.stringify(nextTasks));
        window.localStorage.setItem(projectKey, JSON.stringify(nextProjects));
        window.localStorage.setItem(scheduleKey, JSON.stringify(nextSchedule));
        window.localStorage.setItem(focusTimerKey, JSON.stringify(nextFocusTimer));
        window.localStorage.setItem(focusHistoryKey, JSON.stringify(nextFocusHistory));
      } catch {
        // The server copy remains authoritative when browser storage is unavailable.
      }
      hydrated.current = true;
      syncWasOffline.current = status === "offline";
      setSyncStatus(migratedTenHourSchedule ? "syncing" : status);
      setWorkspaceReady(true);
    }

    void hydrateWorkspace();
    return () => { active = false; };
  }, [sessionUser]);

  useEffect(() => {
    if (!hydrated.current || !sessionUser) return;
    const payload = JSON.stringify({ tasks, projects, schedule: todaySchedule, focusTimer, focusHistory });
    try {
      window.localStorage.setItem(accountStorageKey("tasks", sessionUser.id), JSON.stringify(tasks));
      window.localStorage.setItem(accountStorageKey("projects", sessionUser.id), JSON.stringify(projects));
      window.localStorage.setItem(accountStorageKey("schedule", sessionUser.id), JSON.stringify(todaySchedule));
      window.localStorage.setItem(accountStorageKey("focus-timer", sessionUser.id), JSON.stringify(focusTimer));
      window.localStorage.setItem(accountStorageKey("focus-history", sessionUser.id), JSON.stringify(focusHistory));
    } catch {
      // Continue with cloud sync even if the local cache is unavailable.
    }
    if (payload === lastSyncedPayload.current && !syncWasOffline.current) return;

    const controller = new AbortController();
    setSyncStatus("syncing");
    const timer = window.setTimeout(() => {
      fetch("/api/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Workspace save failed");
          const saved = await response.json() as WorkspaceResponse;
          serverRevision.current = saved.workspace?.revision ?? serverRevision.current;
          lastSyncedPayload.current = payload;
          syncWasOffline.current = false;
          setSyncStatus("synced");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          syncWasOffline.current = true;
          setSyncStatus("offline");
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [focusHistory, focusTimer, projects, sessionUser, syncRetry, tasks, todaySchedule]);

  useEffect(() => {
    const loadTheme = window.setTimeout(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    }, 0);
    return () => window.clearTimeout(loadTheme);
  }, []);

  const timerRunning = focusTimer.status === "running";
  const secondsLeft = focusSecondsLeft(focusTimer, clockNow);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setClockNow(currentTimeMs()), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  useEffect(() => {
    if (!timerRunning || secondsLeft > 0 || !focusTimer.sessionId || completingSession.current === focusTimer.sessionId) return;
    completingSession.current = focusTimer.sessionId;
    const completionTimer = window.setTimeout(() => {
      const entry = finishFocusTimer(focusTimer, "completed", currentTimeMs());
      if (entry) setFocusHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 500));
      setFocusTimer({ ...DEFAULT_FOCUS_TIMER });
      setToast("Focus session complete — beautiful work. It’s saved in your history.");
    }, 0);
    return () => window.clearTimeout(completionTimer);
  }, [focusTimer, secondsLeft, timerRunning]);

  useEffect(() => {
    function retryWhenOnline() {
      setSyncRetry((value) => value + 1);
    }
    function markOffline() {
      syncWasOffline.current = true;
      setSyncStatus("offline");
    }
    window.addEventListener("online", retryWhenOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    const timerKey = accountStorageKey("focus-timer", sessionUser.id);
    const historyKey = accountStorageKey("focus-history", sessionUser.id);
    function receiveTimerFromAnotherTab(event: StorageEvent) {
      if (!event.newValue) return;
      try {
        if (event.key === timerKey) setFocusTimer(normalizeFocusTimer(JSON.parse(event.newValue)));
        if (event.key === historyKey) setFocusHistory(normalizeFocusHistory(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed storage events and keep the current timer.
      }
    }
    window.addEventListener("storage", receiveTimerFromAnotherTab);
    return () => window.removeEventListener("storage", receiveTimerFromAnotherTab);
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser || !workspaceReady) return;
    let active = true;

    async function refreshWorkspace() {
      if (!navigator.onLine) return;
      const local = latestWorkspace.current;
      const localPayload = JSON.stringify(local);
      if (localPayload !== lastSyncedPayload.current) return;
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        if (!response.ok || response.headers.get("X-Orbit-Offline") === "true") return;
        const { workspace } = await response.json() as WorkspaceResponse;
        if (!active || !workspace || workspace.revision <= serverRevision.current) return;
        const remote = {
          tasks: Array.isArray(workspace.tasks) ? workspace.tasks : INITIAL_TASKS,
          projects: Array.isArray(workspace.projects) ? workspace.projects : INITIAL_PROJECTS,
          schedule: isScheduleWindow(workspace.schedule) ? workspace.schedule : DEFAULT_TODAY_SCHEDULE,
          focusTimer: normalizeFocusTimer(workspace.focusTimer),
          focusHistory: normalizeFocusHistory(workspace.focusHistory),
        };
        serverRevision.current = workspace.revision;
        lastSyncedPayload.current = JSON.stringify(remote);
        setTasks(remote.tasks);
        setProjects(remote.projects);
        setTodaySchedule(remote.schedule);
        setFocusTimer(remote.focusTimer);
        setFocusHistory(remote.focusHistory);
        setFocusTask((current) => remote.tasks.find((task) => task.id === remote.focusTimer.taskId && !task.completed) ?? remote.tasks.find((task) => task.id === current?.id && !task.completed) ?? remote.tasks.find((task) => !task.completed) ?? null);
        setSyncStatus("synced");
      } catch {
        // Local state remains available; the online event will retry later.
      }
    }

    const interval = window.setInterval(() => void refreshWorkspace(), 8_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [sessionUser, workspaceReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key.toLowerCase() === "q") {
        const defaultProject = projects.find((project) => project.id === activeProjectId)?.name ?? projects[0]?.name ?? "";
        setEditingTask(null);
        setDraft({ ...emptyDraft, project: defaultProject });
        setTaskModalOpen(true);
      }
      if (event.key.toLowerCase() === "f") {
        if (focusTimer.status !== "idle") {
          setFocusPickerOpen(false);
          setFocusOpen(true);
        } else {
          setFocusTask((current) => current && !current.completed ? current : tasks.find((task) => !task.completed) ?? null);
          setFocusOpen(false);
          setFocusPickerOpen(true);
        }
      }
      if (event.key === "/") {
        event.preventDefault();
        setShowSearch(true);
        window.setTimeout(() => document.getElementById("orbit-search")?.focus(), 50);
      }
      if (event.key === "Escape") {
        setTaskModalOpen(false);
        setProjectModalOpen(false);
        setProjectCreateError("");
        setEditingProject(null);
        setDeletingProject(null);
        setFocusPickerOpen(false);
        setFocusOpen(false);
        setMobileMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeProjectId, focusTimer.status, projects, tasks]);

  const visibleTasks = useMemo(() => {
    return filterTasks(tasks, { search, priority: priorityFilter, project: projectFilter, status: statusFilter, due: dueFilter });
  }, [dueFilter, priorityFilter, projectFilter, search, statusFilter, tasks]);

  const openTasks = tasks.filter((task) => !task.completed);
  const completedCount = tasks.filter((task) => task.completed).length;
  const filteredOpenTasks = visibleTasks.filter((task) => !task.completed);
  const filteredCompletedCount = visibleTasks.filter((task) => task.completed).length;
  const filteredProgress = visibleTasks.length ? Math.round((filteredCompletedCount / visibleTasks.length) * 100) : 0;
  const priorities = filteredOpenTasks.filter((task) => task.priority === "Very High" || task.priority === "High");
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const heading = activeProject
    ? { eyebrow: "Project workspace", title: activeProject.name, description: "Keep every task, decision, and next move in one clear orbit." }
    : activeView === "today"
      ? { ...VIEW_TITLES.today, eyebrow: localDateLabel, title: `${localGreeting}, ${sessionUser?.displayName.split(" ")[0] ?? "there"}` }
      : VIEW_TITLES[activeView];
  const taskFiltersVisible = activeView !== "analytics" && (activeView !== "projects" || Boolean(activeProject));
  const activeFilterCount = [search.trim(), priorityFilter !== "All", projectFilter !== "All", statusFilter !== "All", dueFilter !== "All"].filter(Boolean).length;
  const viewTaskCount = activeProject
    ? visibleTasks.filter((task) => task.project === activeProject.name).length
    : activeView === "inbox" || activeView === "upcoming"
        ? visibleTasks.filter((task) => !task.completed).length
        : activeView === "completed"
          ? visibleTasks.filter((task) => task.completed).length
          : visibleTasks.length;
  const totalViewTaskCount = activeProject
    ? tasks.filter((task) => task.project === activeProject.name).length
    : activeView === "inbox" || activeView === "upcoming"
        ? tasks.filter((task) => !task.completed).length
        : activeView === "completed"
          ? tasks.filter((task) => task.completed).length
          : tasks.length;

  function clearTaskFilters() {
    setSearch("");
    setPriorityFilter("All");
    setProjectFilter("All");
    setStatusFilter("All");
    setDueFilter("All");
  }

  function navigate(view: View) {
    setActiveView(view);
    setActiveProjectId(null);
    setMobileMenuOpen(false);
    router.push(VIEW_PATHS[view]);
  }

  function navigateProject(project: Project) {
    setActiveView("projects");
    setActiveProjectId(project.id);
    setProjectFilter("All");
    setMobileMenuOpen(false);
    router.push(`/projects/${project.id}`);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("orbit-theme", nextTheme);
    setTheme(nextTheme);
    setToast(`${nextTheme === "dark" ? "Dark" : "Light"} mode on`);
  }

  function openNewTask() {
    const defaultProject = projects.find((project) => project.id === activeProjectId)?.name ?? projects[0]?.name ?? "";
    setEditingTask(null);
    setDraft({ ...emptyDraft, project: defaultProject });
    setTaskModalOpen(true);
  }

  function openNewProject() {
    setNewProjectDraft({ ...emptyProjectDraft, color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length] });
    setProjectCreateError("");
    setProjectModalOpen(true);
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    const name = newProjectDraft.name.trim();
    if (!name) {
      setProjectCreateError("Enter a project name");
      return;
    }
    if (projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
      setProjectCreateError("A project with that name already exists");
      return;
    }

    const project: Project = {
      id: uniqueProjectId(name, projects),
      name,
      color: newProjectDraft.color,
      description: newProjectDraft.description.trim() || "A clear space to move this outcome forward.",
    };
    const nextProjects = [...projects, project];
    setProjects(nextProjects);
    setActiveView("projects");
    setActiveProjectId(project.id);
    setProjectModalOpen(false);
    setMobileMenuOpen(false);
    setToast(`${project.name} created`);
    router.push(`/projects/${project.id}`);
  }

  function openRenameProject(project: Project) {
    setEditingProject(project);
    setProjectNameDraft(project.name);
  }

  function deleteProject() {
    if (!deletingProject) return;
    const project = deletingProject;
    const remainingProjects = projects.filter((item) => item.id !== project.id);
    const remainingTasks = tasks.filter((task) => task.project !== project.name);
    const deletedTaskCount = tasks.length - remainingTasks.length;

    setProjects(remainingProjects);
    setTasks(remainingTasks);
    setFocusTask((current) => current?.project === project.name ? remainingTasks.find((task) => !task.completed) ?? null : current);
    if (projectFilter === project.name) setProjectFilter("All");
    if (draft.project === project.name) setDraft((current) => ({ ...current, project: remainingProjects[0]?.name ?? "" }));
    if (activeProjectId === project.id) {
      setActiveProjectId(null);
      setActiveView("projects");
      router.push("/projects");
    }
    setDeletingProject(null);
    setFocusOpen(false);
    setFocusPickerOpen(false);
    setToast(`${project.name} and ${deletedTaskCount} task${deletedTaskCount === 1 ? "" : "s"} deleted`);
  }

  function renameProject(event: FormEvent) {
    event.preventDefault();
    if (!editingProject) return;
    const nextName = projectNameDraft.trim();
    if (!nextName) return;
    const duplicate = projects.some((project) => project.id !== editingProject.id && project.name.toLowerCase() === nextName.toLowerCase());
    if (duplicate) {
      setToast("A project with that name already exists");
      return;
    }

    const previousName = editingProject.name;
    setProjects((current) => current.map((project) => project.id === editingProject.id ? { ...project, name: nextName } : project));
    setTasks((current) => current.map((task) => task.project === previousName ? { ...task, project: nextName } : task));
    setProjectFilter((current) => current === previousName ? nextName : current);
    setDraft((current) => current.project === previousName ? { ...current, project: nextName } : current);
    setEditingProject(null);
    setToast(`Project renamed to ${nextName}`);
  }

  function openEditTask(task: Task) {
    setEditingTask(task);
    setDraft({
      title: task.title,
      project: task.project,
      due: task.due,
      time: task.time,
      duration: task.duration,
      priority: task.priority,
      notes: task.notes,
    });
    setTaskModalOpen(true);
  }

  function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    if (editingTask) {
      setTasks((current) => current.map((task) => task.id === editingTask.id ? { ...task, ...draft, title: draft.title.trim() } : task));
      setToast("Task updated");
    } else {
      const task: Task = { ...draft, title: draft.title.trim(), id: Date.now(), status: "todo", completed: false };
      setTasks((current) => [task, ...current]);
      setToast("Task added to your day");
    }
    setTaskModalOpen(false);
  }

  function toggleTask(id: number) {
    const target = tasks.find((task) => task.id === id);
    setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed, status: !task.completed ? "done" : "todo" } : task));
    setToast(target?.completed ? "Task restored" : "One step closer. Task complete.");
  }

  function deleteTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id));
    setTaskModalOpen(false);
    setToast("Task removed");
  }

  function moveTask(id: number, status: TaskStatus) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status, completed: status === "done" } : task));
  }

  function updateTodaySchedule(schedule: ScheduleWindow) {
    setTodaySchedule(schedule);
    setToast(`Today’s schedule updated to ${formatScheduleTime(schedule.startTime)}–${formatScheduleTime(schedule.endTime)}`);
  }

  function archiveFocusTimer(status: "completed" | "stopped", timer = focusTimer) {
    const entry = finishFocusTimer(timer, status, currentTimeMs());
    if (entry) setFocusHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 500));
    completingSession.current = null;
    return entry;
  }

  function openFocus(task: Task | null) {
    const nextTask = task ?? openTasks[0] ?? null;
    if (!nextTask) {
      setFocusTask(null);
      setFocusPickerOpen(true);
      return;
    }
    if (focusTimer.status !== "idle" && focusTimer.taskId === nextTask.id) {
      setFocusTask(nextTask);
      setFocusPickerOpen(false);
      setFocusOpen(true);
      return;
    }
    if (focusTimer.status !== "idle") archiveFocusTimer("stopped");
    setFocusTask(nextTask);
    setFocusTimer({ ...DEFAULT_FOCUS_TIMER });
    setFocusPickerOpen(false);
    setFocusOpen(true);
  }

  function openFocusPicker() {
    if (focusTimer.status !== "idle") {
      setFocusPickerOpen(false);
      setFocusOpen(true);
      return;
    }
    setFocusTask((current) => current && !current.completed ? current : openTasks[0] ?? null);
    setFocusOpen(false);
    setFocusPickerOpen(true);
  }

  function chooseDifferentFocusTask() {
    if (focusTimer.status !== "idle") archiveFocusTimer("stopped");
    setFocusTimer({ ...DEFAULT_FOCUS_TIMER });
    setFocusTask(openTasks.find((task) => task.id !== focusTimer.taskId) ?? openTasks[0] ?? null);
    setFocusOpen(false);
    setFocusPickerOpen(true);
  }

  function toggleFocusTimer() {
    setClockNow(currentTimeMs());
    if (focusTimer.status === "running") {
      setFocusTimer(pauseFocusTimer(focusTimer));
      return;
    }
    if (focusTimer.status === "paused") {
      completingSession.current = null;
      setFocusTimer(resumeFocusTimer(focusTimer));
      return;
    }
    if (!focusTask) return;
    completingSession.current = null;
    setFocusTimer(startFocusTimer(focusTask, focusTimer.remainingSeconds || DEFAULT_FOCUS_SECONDS));
  }

  function resetFocusTimer() {
    if (focusTimer.status !== "idle") archiveFocusTimer("stopped");
    setFocusTimer({ ...DEFAULT_FOCUS_TIMER });
    setClockNow(currentTimeMs());
  }

  function addFocusTime() {
    setFocusTimer((current) => extendFocusTimer(current, 5 * 60));
    setClockNow(Date.now());
  }

  const navItems: { view: View; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { view: "today", label: "Today", icon: LayoutDashboard, count: openTasks.filter((task) => task.due === "Today").length },
    { view: "inbox", label: "Inbox", icon: Inbox, count: openTasks.length },
    { view: "upcoming", label: "Upcoming", icon: CalendarDays },
    { view: "board", label: "Board", icon: KanbanSquare },
    { view: "analytics", label: "Insights", icon: BarChart3 },
    { view: "completed", label: "Completed", icon: CheckCircle2, count: completedCount },
  ];

  return (
    <div className="app-shell">
      {!workspaceReady && <div className="workspace-loading" role="status"><div className="brand-mark" aria-hidden="true"><span /><i /></div><strong>Preparing your Orbit…</strong></div>}
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><span /><i /></div>
          <span className="brand-name">Orbit</span>
          <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation"><X size={20} /></button>
        </div>

        <button className="create-button" onClick={openNewTask}><Plus size={19} strokeWidth={2.4} /> Add task <kbd>Q</kbd></button>

        <nav className="main-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.view} className={activeView === item.view ? "nav-item active" : "nav-item"} onClick={() => navigate(item.view)}>
                <Icon size={19} strokeWidth={1.9} />
                <span>{item.label}</span>
                {item.count !== undefined && <em>{item.count}</em>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section">
          <div className="section-label">
            <Link
              href="/projects"
              className="section-label-link"
              aria-label="View all projects"
              aria-current={activeView === "projects" && !activeProjectId ? "page" : undefined}
              onClick={() => {
                setActiveView("projects");
                setActiveProjectId(null);
                setMobileMenuOpen(false);
              }}
            >
              Projects
            </Link>
            <button type="button" onClick={openNewProject} aria-label="Add project"><Plus size={15} /></button>
          </div>
          <div className="sidebar-project-list" aria-label={`All ${projects.length} projects`}>
            {projects.map((project) => (
              <button className={activeProjectId === project.id ? "project-link active" : "project-link"} key={project.id} onClick={() => navigateProject(project)}>
                <span className="project-dot" style={{ background: project.color }} />
                <span>{project.name}</span>
                <em>{tasks.filter((task) => task.project === project.name && !task.completed).length}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="orbit-note">
            <Sparkles size={17} fill="currentColor" />
            <p><strong>Small progress</strong><br />orbits big outcomes.</p>
            <span className="note-orbit" />
          </div>
          <button className="nav-item"><Settings size={19} /><span>Settings</span></button>
          <p className={`local-save ${syncStatus}`}>
            {syncStatus === "offline" ? <CloudOff size={13} /> : syncStatus === "syncing" || syncStatus === "loading" ? <RotateCcw size={13} /> : <Cloud size={13} />}
            {syncStatus === "offline" ? "Offline — changes cached" : syncStatus === "syncing" || syncStatus === "loading" ? "Syncing across devices…" : `Synced for ${sessionUser?.displayName ?? "your account"}`}
          </p>
        </div>
      </aside>

      {mobileMenuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className={`search-box ${showSearch ? "search-visible" : ""}`}>
            <Search size={18} />
            <input id="orbit-search" type="search" placeholder="Search tasks…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search tasks" />
            {!search && <kbd>/</kbd>}
          </div>
          <div className="topbar-actions">
            <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /><span className="notification-dot" /></button>
            <div className="profile">
              <div className="avatar">{userInitials(sessionUser?.displayName ?? "AJ Miller")}<span /></div>
              <div><strong>{sessionUser?.displayName ?? "AJ Miller"}</strong><small>@{sessionUser?.username ?? "aj.miller"}</small></div>
              <form action="/api/auth/logout" method="post" onSubmit={() => navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" })}><button className="profile-logout" type="submit" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button></form>
            </div>
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{heading.eyebrow}</p>
              <h1>{heading.title}</h1>
              <p>{heading.description}</p>
            </div>
            <div className="heading-actions">
              <button className="secondary-button" type="button" onClick={() => setShowSearch(true)}><Search size={17} /> Search</button>
              {activeProject && <button className="primary-button" type="button" onClick={openNewTask}><Plus size={17} /> Add task</button>}
              <button className="focus-button" type="button" onClick={openFocusPicker}><Zap size={17} fill="currentColor" /> {focusTimer.status === "idle" ? "Start focus" : `Focus · ${timeLabel(secondsLeft)}`} <kbd>F</kbd></button>
            </div>
          </section>

          {taskFiltersVisible && (
            <TaskFilterBar
              tasks={tasks}
              projects={projects}
              priority={priorityFilter}
              project={projectFilter}
              status={statusFilter}
              due={dueFilter}
              resultCount={viewTaskCount}
              totalCount={totalViewTaskCount}
              activeCount={activeFilterCount}
              showProjectFilter={!activeProject}
              onPriorityChange={setPriorityFilter}
              onProjectChange={setProjectFilter}
              onStatusChange={setStatusFilter}
              onDueChange={setDueFilter}
              onClear={clearTaskFilters}
            />
          )}

          {activeView === "today" && (
            <TodayView
              tasks={visibleTasks}
              openTasks={filteredOpenTasks}
              priorities={priorities}
              progress={filteredProgress}
              completedCount={filteredCompletedCount}
              schedule={todaySchedule}
              onAdd={openNewTask}
              onToggle={toggleTask}
              onEdit={openEditTask}
              onFocus={openFocus}
              onScheduleChange={updateTodaySchedule}
            />
          )}
          {activeView === "board" && <BoardView tasks={visibleTasks} onMove={moveTask} onToggle={toggleTask} onEdit={openEditTask} onFocus={openFocus} />}
          {activeView === "upcoming" && <UpcomingView tasks={visibleTasks} projects={projects} onToggle={toggleTask} onEdit={openEditTask} onFocus={openFocus} />}
          {activeView === "inbox" && <ListView tasks={visibleTasks.filter((task) => !task.completed)} projects={projects} title="Everything on your radar" onToggle={toggleTask} onEdit={openEditTask} onFocus={openFocus} />}
          {activeView === "completed" && <ListView tasks={visibleTasks.filter((task) => task.completed)} projects={projects} title="A trail of progress" onToggle={toggleTask} onEdit={openEditTask} onFocus={openFocus} empty="Complete a task and it will appear here." />}
          {activeView === "projects" && (activeProject
            ? <ListView tasks={visibleTasks.filter((task) => task.project === activeProject.name)} projects={projects} title={`${activeProject.name} tasks`} onToggle={toggleTask} onEdit={openEditTask} onFocus={openFocus} empty="This project is ready for its first task." />
            : <ProjectsView tasks={tasks} projects={projects} onCreateProject={openNewProject} onOpenProject={navigateProject} onRenameProject={openRenameProject} onDeleteProject={setDeletingProject} />)}
          {activeView === "analytics" && <AnalyticsView tasks={tasks} focusHistory={focusHistory} />}
        </div>
      </main>

      <div className="floating-controls">
        <button className="mobile-add" onClick={openNewTask} aria-label="Add task"><Plus size={22} /></button>
      </div>

      {taskModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTaskModalOpen(false)}>
          <form className="task-modal" onSubmit={saveTask}>
            <div className="modal-header"><div><p className="eyebrow">{editingTask ? "Refine the plan" : "Capture what matters"}</p><h2>{editingTask ? "Edit task" : "New task"}</h2></div><button className="icon-button" type="button" onClick={() => setTaskModalOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <label className="field-label">Task name<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What needs to move forward?" required /></label>
            <div className="form-grid">
              <label className="field-label">Project<select value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })}>{projects.map((project) => <option key={project.id}>{project.name}</option>)}</select></label>
              <label className="field-label">Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><option>Very High</option><option>High</option><option>Medium</option><option>Low</option></select></label>
              <label className="field-label">Due<select value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })}><option>Today</option><option>Tomorrow</option><option>Friday</option><option>Monday</option><option>Someday</option></select></label>
              <label className="field-label">Time<input value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></label>
              <label className="field-label">Estimate<select value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option></select></label>
            </div>
            <label className="field-label">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Add helpful context…" rows={3} /></label>
            <div className="modal-actions">
              {editingTask && <button className="delete-button" type="button" onClick={() => deleteTask(editingTask.id)}><Trash2 size={16} /> Delete</button>}
              <span />
              <button className="secondary-button" type="button" onClick={() => setTaskModalOpen(false)}>Cancel</button>
              <button className="primary-button" type="submit">{editingTask ? "Save changes" : "Create task"}<ArrowRight size={17} /></button>
            </div>
          </form>
        </div>
      )}

      {projectModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setProjectModalOpen(false)}>
          <form className="task-modal project-create-modal" onSubmit={createProject} role="dialog" aria-modal="true" aria-labelledby="create-project-title">
            <div className="modal-header"><div><p className="eyebrow">Start a new outcome</p><h2 id="create-project-title">Create project</h2></div><button className="icon-button" type="button" onClick={() => setProjectModalOpen(false)} aria-label="Close"><X size={20} /></button></div>
            <label className="field-label">Project name<input autoFocus value={newProjectDraft.name} onChange={(event) => { setNewProjectDraft({ ...newProjectDraft, name: event.target.value }); setProjectCreateError(""); }} placeholder="e.g. Customer portal launch" maxLength={60} required /></label>
            <label className="field-label">Description<textarea value={newProjectDraft.description} onChange={(event) => setNewProjectDraft({ ...newProjectDraft, description: event.target.value })} placeholder="What does success look like?" maxLength={160} rows={3} /></label>
            <fieldset className="project-color-field">
              <legend>Project color</legend>
              <div className="project-color-options">
                {PROJECT_COLORS.map((color) => (
                  <button className={newProjectDraft.color === color ? "project-color-option active" : "project-color-option"} type="button" key={color} onClick={() => setNewProjectDraft({ ...newProjectDraft, color })} aria-label={`Use ${color} project color`} aria-pressed={newProjectDraft.color === color}>
                    <span style={{ background: color }} />
                    {newProjectDraft.color === color && <Check size={14} />}
                  </button>
                ))}
              </div>
            </fieldset>
            {projectCreateError && <p className="field-error" role="alert">{projectCreateError}</p>}
            <p className="rename-hint"><Cloud size={15} /> Your project will sync to every device signed in to this account.</p>
            <div className="modal-actions"><span /><button className="secondary-button" type="button" onClick={() => setProjectModalOpen(false)}>Cancel</button><button className="primary-button" type="submit">Create project<ArrowRight size={17} /></button></div>
          </form>
        </div>
      )}

      {editingProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingProject(null)}>
          <form className="task-modal project-rename-modal" onSubmit={renameProject}>
            <div className="modal-header"><div><p className="eyebrow">Project settings</p><h2>Rename project</h2></div><button className="icon-button" type="button" onClick={() => setEditingProject(null)} aria-label="Close"><X size={20} /></button></div>
            <label className="field-label">Project name<input autoFocus value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} placeholder="Enter a project name" required /></label>
            <p className="rename-hint"><Pencil size={15} /> Every task in this project will be updated automatically. Its URL and progress history will stay the same.</p>
            <div className="modal-actions"><span /><button className="secondary-button" type="button" onClick={() => setEditingProject(null)}>Cancel</button><button className="primary-button" type="submit">Save name<ArrowRight size={17} /></button></div>
          </form>
        </div>
      )}

      {deletingProject && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeletingProject(null)}>
          <section className="task-modal project-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
            <div className="modal-header"><div><p className="eyebrow">Permanent action</p><h2 id="delete-project-title">Delete project?</h2></div><button className="icon-button" type="button" onClick={() => setDeletingProject(null)} aria-label="Close"><X size={20} /></button></div>
            <div className="project-delete-warning"><span><Trash2 size={21} /></span><div><strong>{deletingProject.name}</strong><p>This will delete the project and all {tasks.filter((task) => task.project === deletingProject.name).length} tasks inside it, including completed tasks.</p></div></div>
            <p className="project-delete-note">This action cannot be undone from the app.</p>
            <div className="modal-actions"><span /><button className="secondary-button" type="button" onClick={() => setDeletingProject(null)}>Cancel</button><button className="danger-confirm-button" type="button" onClick={deleteProject}><Trash2 size={16} /> Delete project</button></div>
          </section>
        </div>
      )}

      {focusPickerOpen && (
        <div className="modal-backdrop focus-picker-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setFocusPickerOpen(false)}>
          <section className="focus-picker" role="dialog" aria-modal="true" aria-labelledby="focus-picker-title">
            <div className="modal-header">
              <div><p className="eyebrow">Protect your attention</p><h2 id="focus-picker-title">Choose a task to focus on</h2></div>
              <button className="icon-button" type="button" onClick={() => setFocusPickerOpen(false)} aria-label="Close task picker"><X size={20} /></button>
            </div>
            {openTasks.length ? (
              <div className="focus-task-list" aria-label="Incomplete tasks">
                {openTasks.map((task) => {
                  const selected = focusTask?.id === task.id;
                  return (
                    <button className={selected ? "focus-task-option selected" : "focus-task-option"} type="button" key={task.id} onClick={() => setFocusTask(task)} aria-pressed={selected}>
                      <span className="focus-task-select">{selected ? <Check size={15} /> : <span />}</span>
                      <span className="focus-task-copy"><strong>{task.title}</strong><small>{task.project} · {task.due} at {task.time}</small></span>
                      <span className={`priority-label ${priorityClass(task.priority)}`}>{task.priority}</span>
                      <span className="focus-task-duration"><Clock3 size={14} />{formatDuration(task.duration)}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="focus-picker-empty"><CheckCircle2 size={28} /><strong>Your task list is clear</strong><p>Add a task when you are ready for another focused session.</p></div>
            )}
            <div className="focus-picker-actions">
              <button className="secondary-button" type="button" onClick={() => setFocusPickerOpen(false)}>Cancel</button>
              <button className="primary-button" type="button" disabled={!focusTask} onClick={() => openFocus(focusTask)}>Start 25 min <ArrowRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      {focusOpen && (
        <div className="modal-backdrop focus-backdrop" role="presentation">
          <section className="focus-modal" role="dialog" aria-modal="true" aria-label="Focus timer">
            <button className="icon-button focus-close" onClick={() => setFocusOpen(false)} aria-label="Close focus timer"><X size={20} /></button>
            <div className="focus-orbit"><span /><i /><b /></div>
            <p className="eyebrow">Deep work session</p>
            <h2>{focusTimer.status !== "idle" ? focusTimer.taskTitle : focusTask?.title ?? "Choose one meaningful task"}</h2>
            <div className="timer-display">{timeLabel(secondsLeft)}</div>
            <p className="focus-copy">{timerRunning ? "Still running if you close this window or switch devices." : focusTimer.status === "paused" ? "Paused and synced. Resume whenever you’re ready." : "One task. No noise. You have everything you need."}</p>
            <button className="focus-change" type="button" onClick={chooseDifferentFocusTask}>Choose a different task</button>
            <div className="timer-actions">
              <button className="timer-reset" onClick={resetFocusTimer} aria-label="Reset timer"><RotateCcw size={19} /></button>
              <button className="timer-play" onClick={toggleFocusTimer}>{timerRunning ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}<span>{timerRunning ? "Pause" : focusTimer.status === "paused" ? "Resume" : "Begin focus"}</span></button>
              <button className="timer-reset" onClick={addFocusTime} aria-label="Add five minutes"><Plus size={19} /></button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function TaskFilterBar({ tasks, projects, priority, project, status, due, resultCount, totalCount, activeCount, showProjectFilter, onPriorityChange, onProjectChange, onStatusChange, onDueChange, onClear }: {
  tasks: Task[];
  projects: Project[];
  priority: "All" | Priority;
  project: string;
  status: StatusFilter;
  due: string;
  resultCount: number;
  totalCount: number;
  activeCount: number;
  showProjectFilter: boolean;
  onPriorityChange: (value: "All" | Priority) => void;
  onProjectChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onDueChange: (value: string) => void;
  onClear: () => void;
}) {
  const dueOptions = Array.from(new Set(tasks.map((task) => task.due)));

  return (
    <section className="task-filter-bar" aria-label="Task filters">
      <div className="task-filter-summary">
        <span className="task-filter-icon"><ListFilter size={17} /></span>
        <div><strong>Filter tasks</strong><small>{resultCount} of {totalCount} matching</small></div>
        {activeCount > 0 && <em aria-label={`${activeCount} active filters`}>{activeCount}</em>}
      </div>
      <div className="task-filter-fields">
        <label className="task-filter-control">
          <span>Priority</span>
          <select value={priority} onChange={(event) => onPriorityChange(event.target.value as "All" | Priority)}>
            <option value="All">All priorities</option>
            <option value="Very High">Very High</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </label>
        {showProjectFilter && (
          <label className="task-filter-control">
            <span>Project</span>
            <select value={project} onChange={(event) => onProjectChange(event.target.value)}>
              <option value="All">All projects</option>
              {projects.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <label className="task-filter-control">
          <span>Status</span>
          <select value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)}>
            <option value="All">All statuses</option>
            <option value="todo">To do</option>
            <option value="in-progress">In progress</option>
            <option value="done">Completed</option>
          </select>
        </label>
        <label className="task-filter-control">
          <span>Due</span>
          <select value={due} onChange={(event) => onDueChange(event.target.value)}>
            <option value="All">Any date</option>
            {dueOptions.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <button className="clear-task-filters" type="button" onClick={onClear} disabled={activeCount === 0}><RotateCcw size={15} /> Clear</button>
    </section>
  );
}

function TodayView({ tasks, openTasks, priorities, progress, completedCount, schedule, onAdd, onToggle, onEdit, onFocus, onScheduleChange }: { tasks: Task[]; openTasks: Task[]; priorities: Task[]; progress: number; completedCount: number; schedule: ScheduleWindow; onAdd: () => void; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void; onScheduleChange: (schedule: ScheduleWindow) => void }) {
  const featured = tasks.filter((task) => !task.completed && task.due === "Today").slice(0, 3);
  const planRef = useRef<HTMLDivElement>(null);
  const [planHighlighted, setPlanHighlighted] = useState(false);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [startTimeDraft, setStartTimeDraft] = useState(schedule.startTime);
  const [endTimeDraft, setEndTimeDraft] = useState(schedule.endTime);
  const [scheduleError, setScheduleError] = useState("");

  useEffect(() => {
    if (!planHighlighted) return;
    const timer = window.setTimeout(() => setPlanHighlighted(false), 1600);
    return () => window.clearTimeout(timer);
  }, [planHighlighted]);

  function viewPlan() {
    planRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    planRef.current?.focus({ preventScroll: true });
    setPlanHighlighted(true);
  }

  function openScheduleEditor() {
    setStartTimeDraft(schedule.startTime);
    setEndTimeDraft(schedule.endTime);
    setScheduleError("");
    setScheduleEditorOpen(true);
  }

  function closeScheduleEditor() {
    setScheduleEditorOpen(false);
    setScheduleError("");
  }

  function saveSchedule(event: FormEvent) {
    event.preventDefault();
    const nextSchedule = { startTime: startTimeDraft, endTime: endTimeDraft };
    if (!isScheduleWindow(nextSchedule)) {
      setScheduleError("End time must be later than start time.");
      return;
    }
    onScheduleChange(nextSchedule);
    closeScheduleEditor();
  }

  function useTenHourWindow() {
    const startMinutes = timeValueToMinutes(startTimeDraft);
    if (startMinutes + 600 >= 24 * 60) {
      setStartTimeDraft(DEFAULT_TODAY_SCHEDULE.startTime);
      setEndTimeDraft(DEFAULT_TODAY_SCHEDULE.endTime);
    } else {
      const endMinutes = startMinutes + 600;
      setEndTimeDraft(`${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:${(endMinutes % 60).toString().padStart(2, "0")}`);
    }
    setScheduleError("");
  }

  const timelineLabels = scheduleTimeLabels(schedule);
  const scheduleMinutes = timeValueToMinutes(schedule.endTime) - timeValueToMinutes(schedule.startTime);
  const planBlocks = [
    { label: "Focused work", className: "blue-block", left: "5%", width: "30%", duration: Math.round(scheduleMinutes * 0.3) },
    { label: "Meetings", className: "lime-block", left: "42%", width: "20%", duration: Math.round(scheduleMinutes * 0.2) },
    { label: "Review", className: "violet-block", left: "72%", width: "20%", duration: Math.round(scheduleMinutes * 0.2) },
  ];

  return (
    <div className="view-stack">
      <section className="summary-row">
        <div className="summary-item"><span className="metric-icon blue"><CheckCircle2 size={22} /></span><div><strong>{openTasks.length}</strong><small>open tasks</small></div></div>
        <div className="summary-item"><span className="metric-icon lime"><Star size={21} /></span><div><strong>{priorities.length}</strong><small>priorities</small></div></div>
        <div className="progress-summary"><div><span>Today&apos;s progress</span><strong>{progress}%</strong></div><div className="segmented-progress">{Array.from({ length: 8 }).map((_, index) => <span key={index} className={index < Math.round(progress / 12.5) ? "filled" : ""} />)}</div><small>{completedCount} completed · momentum is building</small></div>
        <button className="quick-add" onClick={onAdd}><Plus size={21} /> Add task</button>
      </section>

      <div className="section-heading"><div><p className="eyebrow">Your next best moves</p><h2>Today&apos;s priorities</h2></div><button className="text-button" type="button" onClick={viewPlan}>View plan <ArrowRight size={15} /></button></div>

      <section className="priority-grid">
        {featured.length ? featured.map((task, index) => <PriorityCard key={task.id} task={task} index={index} onToggle={onToggle} onEdit={onEdit} onFocus={onFocus} />) : <EmptyState onAdd={onAdd} />}
      </section>

      <section className="lower-grid">
        <div className={`schedule-card ${planHighlighted ? "plan-highlight" : ""}`} id="today-plan" ref={planRef} tabIndex={-1}>
          <div className="card-title-row">
            <div><p className="eyebrow">Time map</p><h3>Today&apos;s schedule</h3></div>
            <button className="schedule-edit-button" type="button" onClick={openScheduleEditor} aria-expanded={scheduleEditorOpen}><Pencil size={14} /> Edit time</button>
          </div>
          {scheduleEditorOpen && (
            <form className="schedule-time-editor" onSubmit={saveSchedule}>
              <label><span>Start time</span><input type="time" value={startTimeDraft} onChange={(event) => setStartTimeDraft(event.target.value)} required /></label>
              <label><span>End time</span><input type="time" value={endTimeDraft} onChange={(event) => setEndTimeDraft(event.target.value)} required /></label>
              <div className="schedule-editor-actions"><button type="button" onClick={useTenHourWindow}>10 hours</button><button type="button" onClick={closeScheduleEditor}>Cancel</button><button type="submit">Save</button></div>
              {scheduleError && <p className="schedule-error" role="alert">{scheduleError}</p>}
            </form>
          )}
          <div className="schedule-window"><Clock3 size={14} /><span>{formatScheduleTime(schedule.startTime)}–{formatScheduleTime(schedule.endTime)} · {formatDuration(scheduleMinutes)} window</span></div>
          <div className="timeline-hours" style={{ gridTemplateColumns: `repeat(${timelineLabels.length}, minmax(0, 1fr))` }}>{timelineLabels.map((hour, index) => <span key={`${hour}-${index}`}>{hour}</span>)}</div>
          <div className="timeline-track" aria-label={`Balanced plan across a ${formatDuration(scheduleMinutes)} window`}>{planBlocks.map((block) => <span className={`block ${block.className}`} style={{ left: block.left, width: block.width }} title={`${block.label}: ${formatDuration(block.duration)}`} key={block.label} />)}</div>
          <div className="schedule-legend">{planBlocks.map((block) => <span key={block.label}><i className={`legend-${block.className.replace("-block", "")}`} />{block.label} · {formatDuration(block.duration)}</span>)}</div>
        </div>
        <div className="focus-card">
          <div className="mini-orbit"><span /><i /></div>
          <div><p className="eyebrow">Recommended</p><h3>Protect your deep work</h3><p>Your clearest window starts at 10:00 AM.</p></div>
          <button onClick={() => onFocus(featured[0] ?? openTasks[0])}>Start 25 min <ArrowRight size={16} /></button>
        </div>
      </section>
    </div>
  );
}

function PriorityCard({ task, index, onToggle, onEdit, onFocus }: { task: Task; index: number; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void }) {
  const styles = ["card-blue", "card-white", "card-lime"];
  return (
    <article className={`priority-card ${styles[index % styles.length]}`}>
      <div className="task-card-top"><button className="task-check" onClick={() => onToggle(task.id)} aria-label={`Complete ${task.title}`}><Check size={17} /></button><button className="card-star" aria-label="Priority"><Star size={20} fill="currentColor" /></button></div>
      <button className="task-title-button" onClick={() => onEdit(task)}><h3>{task.title}</h3></button>
      <div className="task-meta"><span><CalendarDays size={15} />{task.due}</span><span><Clock3 size={15} />{formatDuration(task.duration)}</span></div>
      <div className="task-card-bottom"><span className="project-pill">{task.project}</span><button className="mini-focus" onClick={() => onFocus(task)}><Zap size={14} fill="currentColor" /> Focus</button></div>
    </article>
  );
}

function BoardView({ tasks, onMove, onToggle, onEdit, onFocus }: { tasks: Task[]; onMove: (id: number, status: TaskStatus) => void; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void }) {
  const columns: { status: TaskStatus; title: string; color: string }[] = [
    { status: "todo", title: "To do", color: "#2457ff" },
    { status: "in-progress", title: "In progress", color: "#c9ff3d" },
    { status: "done", title: "Done", color: "#13a57a" },
  ];
  return (
    <section className="board-grid">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        return (
          <div className="board-column" key={column.status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onMove(Number(event.dataTransfer.getData("task-id")), column.status)}>
            <div className="board-column-heading"><div><i style={{ background: column.color }} /><h2>{column.title}</h2><span>{columnTasks.length}</span></div><button><Plus size={17} /></button></div>
            <div className="board-list">
              {columnTasks.map((task) => (
                <article className="board-task" key={task.id} draggable onDragStart={(event) => event.dataTransfer.setData("task-id", String(task.id))}>
                  <div><span className={`priority-label ${priorityClass(task.priority)}`}>{task.priority}</span><TaskActions task={task} onEdit={onEdit} onFocus={onFocus} /></div>
                  <h3 onClick={() => onEdit(task)}>{task.title}</h3>
                  <p>{task.notes}</p>
                  <div className="board-task-footer"><span><Folder size={14} />{task.project}</span><button className={task.completed ? "round-check checked" : "round-check"} onClick={() => onToggle(task.id)}>{task.completed && <Check size={13} />}</button></div>
                </article>
              ))}
              {!columnTasks.length && <div className="board-empty">Drop tasks here</div>}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function UpcomingView({ tasks, projects, onToggle, onEdit, onFocus }: { tasks: Task[]; projects: Project[]; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void }) {
  const days = ["Today", "Tomorrow", "Friday", "Monday", "Someday"];
  return <section className="timeline-list">{days.map((day, dayIndex) => {
    const dayTasks = tasks.filter((task) => task.due === day && !task.completed);
    if (!dayTasks.length) return null;
    return <div className="timeline-day" key={day}><div className={dayIndex === 0 ? "day-marker current" : "day-marker"}><strong>{day === "Today" ? "01" : String(dayIndex + 2).padStart(2, "0")}</strong><span>{day}</span></div><div className="day-tasks">{dayTasks.map((task) => <TaskRow key={task.id} task={task} projects={projects} onToggle={onToggle} onEdit={onEdit} onFocus={onFocus} />)}</div></div>;
  })}</section>;
}

function ListView({ tasks, projects, title, onToggle, onEdit, onFocus, empty = "No tasks match this view." }: { tasks: Task[]; projects: Project[]; title: string; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void; empty?: string }) {
  return <section className="list-card"><div className="list-card-header"><div><p className="eyebrow">{tasks.length} tasks</p><h2>{title}</h2></div></div>{tasks.length ? <div className="task-list">{tasks.map((task) => <TaskRow key={task.id} task={task} projects={projects} onToggle={onToggle} onEdit={onEdit} onFocus={onFocus} />)}</div> : <div className="empty-list"><CheckCircle2 size={32} /><h3>All clear</h3><p>{empty}</p></div>}</section>;
}

function TaskRow({ task, projects, onToggle, onEdit, onFocus }: { task: Task; projects: Project[]; onToggle: (id: number) => void; onEdit: (task: Task) => void; onFocus: (task: Task) => void }) {
  return <article className={task.completed ? "task-row completed" : "task-row"}><button className={task.completed ? "round-check checked" : "round-check"} onClick={() => onToggle(task.id)} aria-label={`Toggle ${task.title}`}>{task.completed && <Check size={13} />}</button><div className="task-row-main" onClick={() => onEdit(task)}><h3>{task.title}</h3><div><span><span className="project-dot" style={{ background: projects.find((project) => project.name === task.project)?.color }} />{task.project}</span><span><CalendarDays size={13} />{task.due}</span><span><Clock3 size={13} />{task.time}</span></div></div><span className={`priority-label ${priorityClass(task.priority)}`}>{task.priority}</span><TaskActions task={task} onEdit={onEdit} onFocus={onFocus} /></article>;
}

function TaskActions({ task, onEdit, onFocus }: { task: Task; onEdit: (task: Task) => void; onFocus: (task: Task) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="task-actions" ref={menuRef}>
      <button className="icon-button task-actions-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-label={`Actions for ${task.title}`} aria-haspopup="menu" aria-expanded={open}><MoreHorizontal size={18} /></button>
      {open && (
        <div className="task-actions-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(task); }}><Pencil size={15} /> Edit task</button>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onFocus(task); }}><Zap size={15} /> Start focus</button>
        </div>
      )}
    </div>
  );
}

function ProjectsView({ tasks, projects, onCreateProject, onOpenProject, onRenameProject, onDeleteProject }: { tasks: Task[]; projects: Project[]; onCreateProject: () => void; onOpenProject: (project: Project) => void; onRenameProject: (project: Project) => void; onDeleteProject: (project: Project) => void }) {
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const projectStats = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project === project.name);
    const completed = projectTasks.filter((task) => task.completed).length;
    return {
      ...project,
      taskCount: projectTasks.length,
      openCount: projectTasks.length - completed,
      percent: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0,
    };
  });

  return (
    <div className="projects-view">
      <div className="projects-toolbar">
        <div>
          <p className="eyebrow">Portfolio overview</p>
          <h2>{projects.length} active projects</h2>
        </div>
        <div className="projects-toolbar-actions">
          <button className="primary-button" type="button" onClick={onCreateProject}><Plus size={16} /> New project</button>
          <div className="project-view-switch" role="group" aria-label="Project layout">
            <button type="button" className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-pressed={layout === "list"}><Rows3 size={16} /> List</button>
            <button type="button" className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-pressed={layout === "grid"}><LayoutGrid size={16} /> Grid</button>
          </div>
        </div>
      </div>

      {layout === "list" ? (
        <section className="project-list" aria-label="Projects list">
          {projectStats.map((project) => (
            <article className="project-list-row" key={project.id}>
              <button className="project-list-main" type="button" onClick={() => onOpenProject(project)}>
                <span className="project-list-icon" style={{ background: `${project.color}18`, color: project.color }}><Folder size={20} /></span>
                <span className="project-list-copy"><strong>{project.name}</strong><small>{project.description}</small></span>
              </button>
              <div className="project-list-metrics">
                <span><strong>{project.openCount}</strong><small>Open</small></span>
                <span><strong>{project.taskCount}</strong><small>Total</small></span>
              </div>
              <div className="project-list-progress">
                <div><span>Progress</span><strong>{project.percent}%</strong></div>
                <i><span style={{ width: `${project.percent}%`, background: project.color }} /></i>
              </div>
              <div className="project-list-actions"><button className="project-list-delete" type="button" onClick={() => onDeleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 size={16} /></button><button className="project-list-edit" type="button" onClick={() => onRenameProject(project)} aria-label={`Rename ${project.name}`}><Pencil size={16} /></button><button className="project-list-open" type="button" onClick={() => onOpenProject(project)} aria-label={`Open ${project.name}`}><ArrowRight size={17} /></button></div>
            </article>
          ))}
        </section>
      ) : (
        <section className="project-grid">
          {projectStats.map((project, index) => (
            <article className={`project-card project-${index + 1}`} key={project.id}>
              <div className="project-card-top"><span className="project-symbol"><Folder size={21} /></span><div className="project-card-actions"><button className="project-card-delete" type="button" onClick={() => onDeleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 size={17} /></button><button type="button" onClick={() => onRenameProject(project)} aria-label={`Rename ${project.name}`}><Pencil size={18} /></button></div></div>
              <p className="eyebrow">{project.taskCount} tasks</p>
              <h2>{project.name}</h2>
              <p>{project.description}</p>
              <div className="project-progress"><div><span>Progress</span><strong>{project.percent}%</strong></div><i><span style={{ width: `${project.percent}%`, background: project.color }} /></i></div>
              <button className="project-open" type="button" onClick={() => onOpenProject(project)}>Open project <ArrowRight size={16} /></button>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function AnalyticsView({ tasks, focusHistory }: { tasks: Task[]; focusHistory: FocusHistoryEntry[] }) {
  const completed = tasks.filter((task) => task.completed).length;
  const completedFocusSessions = focusHistory.filter((entry) => entry.status === "completed");
  const totalFocusSeconds = completedFocusSessions.reduce((total, entry) => total + entry.durationSeconds, 0);
  const todayKey = new Date().toDateString();
  const todayFocusSeconds = completedFocusSessions.filter((entry) => new Date(entry.endedAt).toDateString() === todayKey).reduce((total, entry) => total + entry.durationSeconds, 0);

  return (
    <div className="analytics-grid">
      <article className="analytics-hero"><div><p className="eyebrow">Tracked focus time</p><h2>{formatDuration(Math.round(totalFocusSeconds / 60))}</h2><span className="positive"><TrendingUp size={15} /> {completedFocusSessions.length} completed sessions</span></div><div className="score-orbit"><span>{completedFocusSessions.length}</span><i /></div></article>
      <article className="stat-card"><span className="stat-icon lime"><Flame size={20} /></span><div><strong>{formatDuration(Math.round(todayFocusSeconds / 60))}</strong><span>Focused today</span></div></article>
      <article className="stat-card"><span className="stat-icon blue"><CheckCircle2 size={20} /></span><div><strong>{completed}</strong><span>Tasks completed</span></div></article>
      <article className="chart-card"><div className="card-title-row"><div><p className="eyebrow">Completion rhythm</p><h3>This week</h3></div><span className="positive">Keep building</span></div><div className="bar-chart">{[36, 58, 44, 78, 64, 88, 54].map((height, index) => <div key={index}><span style={{ height: `${height}%` }} className={index === 5 ? "active" : ""} /><small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small></div>)}</div></article>
      <article className="insight-card"><span className="stat-icon blue"><Sparkles size={20} /></span><p className="eyebrow">Orbit insight</p><h3>Your best work happens before noon.</h3><p>Use the balanced 10-hour plan to protect focused work, meetings, and review time without crowding the day.</p><button>Plan a focus block <ArrowRight size={15} /></button></article>
      <article className="focus-history-card">
        <div className="card-title-row"><div><p className="eyebrow">Timer tracking</p><h3>Focus history</h3></div><span>{focusHistory.length} sessions</span></div>
        {focusHistory.length ? (
          <div className="focus-history-list">
            {focusHistory.slice(0, 10).map((entry) => (
              <div className="focus-history-row" key={entry.id}>
                <span className={`focus-history-status ${entry.status}`}><Zap size={14} /></span>
                <div><strong>{entry.taskTitle}</strong><small>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(entry.endedAt))}</small></div>
                <span>{formatDuration(Math.max(1, Math.round(entry.durationSeconds / 60)))}</span>
                <em>{entry.status === "completed" ? "Completed" : "Stopped"}</em>
              </div>
            ))}
          </div>
        ) : <div className="focus-history-empty"><Clock3 size={26} /><strong>No timer history yet</strong><p>Completed and stopped focus sessions will appear here.</p></div>}
      </article>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <div className="priority-empty"><Target size={28} /><h3>Your orbit is clear</h3><p>Add a priority to begin.</p><button onClick={onAdd}><Plus size={16} /> Add task</button></div>;
}
