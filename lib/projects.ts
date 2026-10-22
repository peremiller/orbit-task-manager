export type Project = {
  id: string;
  name: string;
  color: string;
  description: string;
  // Older workspaces omit this field and remain active.
  disabled?: boolean;
};

export function tasksForEnabledProjects<T extends { project: string }>(tasks: T[], projects: Project[]): T[] {
  const disabledNames = new Set(projects.filter((project) => project.disabled === true).map((project) => project.name));
  return tasks.filter((task) => !disabledNames.has(task.project));
}
