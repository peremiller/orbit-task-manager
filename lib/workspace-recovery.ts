type RecoverableTask = {
  id: number;
  title: string;
  project: string;
  due: string;
  time: string;
};

type RecoverableProject = {
  id: string;
  name: string;
};

function recoveryProjectId(name: string, projects: RecoverableProject[]) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "project";
  const ids = new Set(projects.map((project) => project.id));
  if (!ids.has(base)) return base;

  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function mergeRecoveredTasks<TaskType extends RecoverableTask>(current: TaskType[], recovered: TaskType[]) {
  const merged = [...current];
  const signatureIndexes = new Map(current.map((task, index) => [`${task.title}\u0000${task.project}\u0000${task.due}\u0000${task.time}`.toLowerCase(), index]));
  const usedIds = new Set(current.map((task) => task.id));
  let nextId = Math.max(0, ...current.map((task) => task.id), ...recovered.map((task) => task.id));

  for (const task of recovered) {
    const signature = `${task.title}\u0000${task.project}\u0000${task.due}\u0000${task.time}`.toLowerCase();
    const existingIndex = signatureIndexes.get(signature);
    if (existingIndex !== undefined) {
      merged[existingIndex] = { ...task, id: merged[existingIndex].id };
      continue;
    }
    let id = task.id;
    if (usedIds.has(id)) id = ++nextId;
    merged.push({ ...task, id });
    signatureIndexes.set(signature, merged.length - 1);
    usedIds.add(id);
  }

  return merged;
}

export function mergeRecoveredProjects<ProjectType extends RecoverableProject>(current: ProjectType[], recovered: ProjectType[]) {
  const merged = [...current];
  const names = new Set(current.map((project) => project.name.trim().toLowerCase()));

  for (const project of recovered) {
    const name = project.name.trim().toLowerCase();
    if (!name || names.has(name)) continue;
    const id = merged.some((item) => item.id === project.id) ? recoveryProjectId(project.name, merged) : project.id;
    merged.push({ ...project, id });
    names.add(name);
  }

  return merged;
}
