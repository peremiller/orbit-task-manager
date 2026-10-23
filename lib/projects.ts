export type ProjectOrigin = {
  id: string;
  name: string;
  color: string;
  description: string;
  // Older workspaces omit this field and remain active.
  disabled?: boolean;
  category?: string;
};

export type Project = ProjectOrigin & {
  mergedFrom?: ProjectOrigin[];
};

export type ProjectMergeRequest = {
  projectIds: string[];
  destinationId: string | null;
  name: string;
  disabled: boolean;
  category?: string;
};

export const PROJECT_CATEGORIES = ["Work, Quality & Governance", "Business & Innovation", "Property & Household", "Money & Investments", "Health & Wellbeing", "Learning, Speaking & Career", "Family & Leisure", "Faith & Spiritual Life", "Safety & Security"];
export const UNCATEGORIZED_PROJECTS = "Uncategorized";

const CATEGORY_RULES: [RegExp, number][] = [
  [/^(?:arc|llc)\b/i, 0],
  [/\b(certification|learning|training|course|six sigma|toastmasters|speaking|career|opportunities|study|education)\b/i, 5],
  [/\b(health|exercise|fitness|sleep|keloid|nutrition|hygiene|wellbeing|wellness|medical|diet)\b/i, 4],
  [/\b(spiritual|church|faith|worship|religion)\b/i, 7],
  [/\b(family|leisure|recreation|holiday|hobbies|friends)\b/i, 6],
  [/\b(bill|bills|investment|investments|financial|finance|money|assets|currency|budget|savings)\b/i, 3],
  [/\b(property|properties|real estate|grocery|groceries|household|home|rental|rentals)\b/i, 2],
  [/\b(security|safety|emergency|preparedness)\b/i, 8],
  [/\b(business|innovation|portfolio|apps|bots|entrepreneurship|startup)\b/i, 1],
  [/\b(testing|test automation|engagement|client|estimation|dashboard|reports|audit|risk|legal|ethics|compliance|governance|quality|team|product|platform|stakeholder)\b/i, 0],
];

export function suggestProjectCategory(name: string) {
  const match = CATEGORY_RULES.find(([pattern]) => pattern.test(name.trim()));
  return match ? PROJECT_CATEGORIES[match[1]] : "Other Priorities";
}

export function projectCategory(project: Pick<Project, "name" | "category">) {
  return typeof project.category !== "string" ? suggestProjectCategory(project.name) : project.category.trim().replace(/\s+/g, " ") || UNCATEGORIZED_PROJECTS;
}

/** One-time metadata migration. Existing custom categories remain authoritative. */
export function initializeProjectCategories<T extends Project>(projects: T[]): T[] {
  let changed = false;
  const next = projects.map(project => {
    const category = projectCategory(project).slice(0, 60);
    if (project.category === category) return project;
    changed = true;
    return { ...project, category };
  });
  return changed ? next : projects;
}

export function projectCategoryNames(projects: Pick<Project, "name" | "category">[]) {
  const names = [...new Set(projects.map(projectCategory))];
  const rank = (name: string) => name === UNCATEGORIZED_PROJECTS ? 100 : PROJECT_CATEGORIES.includes(name) ? PROJECT_CATEGORIES.indexOf(name) : 50;
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function groupProjectsByCategory<T extends Project>(projects: T[]) {
  return projectCategoryNames(projects).map(name => ({ name, projects: projects.filter(project => projectCategory(project) === name) }));
}

export type ProjectCategoryAssignment = { projectId: string; category: string };
export function applyProjectCategoryAssignments<T extends Project>(projects: T[], assignments: ProjectCategoryAssignment[]): T[] {
  const ids = new Set(projects.map(project => project.id));
  const changes = new Map<string, string>();
  const names = new Map<string, string>();
  for (const assignment of assignments) {
    if (!ids.has(assignment.projectId) || changes.has(assignment.projectId)) throw new Error("A project changed. Reopen parent categories and try again.");
    const category = assignment.category.trim().replace(/\s+/g, " ");
    if (!category || category.length > 60) throw new Error("Enter a parent category of 1–60 characters, or choose Uncategorized.");
    const key = category.toLowerCase();
    if (!names.has(key)) names.set(key, category);
    changes.set(assignment.projectId, names.get(key)!);
  }
  return projects.map(project => changes.has(project.id) && project.category !== changes.get(project.id) ? { ...project, category: changes.get(project.id)! } : project);
}

export function filterProjectCategory<T extends { project: string }, P extends Project>(tasks: T[], projects: P[], category: string) {
  if (!category) return { tasks, projects };
  const filtered = projects.filter(project => projectCategory(project) === category);
  const names = new Set(filtered.map(project => project.name));
  return { tasks: tasks.filter(task => names.has(task.project)), projects: filtered };
}

export function projectForId(projects: Project[], id: string | null) {
  return projects.find((project) => project.id === id)
    ?? projects.find((project) => project.mergedFrom?.some((source) => source.id === id));
}

export function projectMergeError(projects: Project[], request: ProjectMergeRequest): string | null {
  const ids = new Set(request.projectIds);
  if (ids.size < 2) return "Select at least two projects / priorities.";
  if ([...ids].some((id) => !projects.some((project) => project.id === id))) return "A selected project changed. Close this window and select your projects again.";
  if (request.destinationId !== null && !ids.has(request.destinationId)) return "Choose a destination from the selected projects.";
  if (request.category !== undefined && (!request.category.trim() || request.category.trim().length > 60)) return "Enter a parent category of 1–60 characters.";
  const name = request.name.trim();
  if (!name || name.length > 80) return "Enter a combined name of 1–80 characters.";
  if (projects.some((project) => !ids.has(project.id) && project.name.trim().toLowerCase() === name.toLowerCase())) return "Another project already uses this name. Choose a different combined name.";
  return null;
}

export function mergeProjects<T extends { project: string }>(tasks: T[], projects: Project[], request: ProjectMergeRequest, newProjectId?: string) {
  const error = projectMergeError(projects, request);
  if (error) throw new Error(error);
  const selected = projects.filter((project) => request.projectIds.includes(project.id));
  const target = projects.find((project) => project.id === request.destinationId);
  const id = target?.id ?? newProjectId;
  if (!id || (!target && projects.some((project) => project.id === id))) throw new Error("The new project needs a unique ID.");
  const origins = new Map<string, ProjectOrigin>();
  for (const project of selected) {
    for (const source of project.mergedFrom ?? []) origins.set(`${source.id}\u0000${source.name}`, source);
    const source: ProjectOrigin = { id: project.id, name: project.name, color: project.color, description: project.description, ...(project.disabled === undefined ? {} : { disabled: project.disabled }), ...(project.category === undefined ? {} : { category: project.category }) };
    origins.set(`${source.id}\u0000${source.name}`, source);
  }
  const destination: Project = {
    ...(target ?? selected[0]),
    id,
    name: request.name.trim(),
    description: target?.description ?? [...new Set(selected.map((project) => project.description).filter(Boolean))].join("\n"),
    disabled: request.disabled,
    category: request.category?.trim().replace(/\s+/g, " ") ?? projectCategory(target ?? selected[0]),
    mergedFrom: [...origins.values()],
  };
  const sourceNames = new Set(selected.map((project) => project.name));
  const firstIndex = projects.findIndex((project) => request.projectIds.includes(project.id));
  const nextProjects = projects.flatMap((project, index) => index === firstIndex ? [destination] : request.projectIds.includes(project.id) ? [] : [project]);
  const nextTasks = tasks.map((task) => sourceNames.has(task.project) && task.project !== destination.name ? { ...task, project: destination.name } : task);
  return { projects: nextProjects, tasks: nextTasks, destination, sourceNames: [...sourceNames] };
}

// Old browser backups may still use names that were merged on another device.
export function remapMergedTaskProjects<T extends { project: string }>(tasks: T[], projects: Project[]): T[] {
  const currentNames = new Set(projects.map((project) => project.name));
  const aliases = new Map(projects.flatMap((project) => (project.mergedFrom ?? []).map((source) => [source.name, project.name] as const)));
  return tasks.map((task) => !currentNames.has(task.project) && aliases.has(task.project) ? { ...task, project: aliases.get(task.project)! } : task);
}

export function tasksForEnabledProjects<T extends { project: string }>(tasks: T[], projects: Project[]): T[] {
  const disabledNames = new Set(projects.filter((project) => project.disabled === true).map((project) => project.name));
  return tasks.filter((task) => !disabledNames.has(task.project));
}
