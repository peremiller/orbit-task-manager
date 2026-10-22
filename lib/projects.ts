export type ProjectOrigin = {
  id: string;
  name: string;
  color: string;
  description: string;
  // Older workspaces omit this field and remain active.
  disabled?: boolean;
};

export type Project = ProjectOrigin & {
  mergedFrom?: ProjectOrigin[];
};

export type ProjectMergeRequest = {
  projectIds: string[];
  destinationId: string | null;
  name: string;
  disabled: boolean;
};

export function projectForId(projects: Project[], id: string | null) {
  return projects.find((project) => project.id === id)
    ?? projects.find((project) => project.mergedFrom?.some((source) => source.id === id));
}

export function projectMergeError(projects: Project[], request: ProjectMergeRequest): string | null {
  const ids = new Set(request.projectIds);
  if (ids.size < 2) return "Select at least two projects / priorities.";
  if ([...ids].some((id) => !projects.some((project) => project.id === id))) return "A selected project changed. Close this window and select your projects again.";
  if (request.destinationId !== null && !ids.has(request.destinationId)) return "Choose a destination from the selected projects.";
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
    const source: ProjectOrigin = { id: project.id, name: project.name, color: project.color, description: project.description, ...(project.disabled === undefined ? {} : { disabled: project.disabled }) };
    origins.set(`${source.id}\u0000${source.name}`, source);
  }
  const destination: Project = {
    ...(target ?? selected[0]),
    id,
    name: request.name.trim(),
    description: target?.description ?? [...new Set(selected.map((project) => project.description).filter(Boolean))].join("\n"),
    disabled: request.disabled,
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
