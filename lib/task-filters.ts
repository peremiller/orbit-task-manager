export type TaskFilterValues = {
  search: string;
  priority: string;
  project: string;
  status: string;
  due: string;
  label?: string;
};

type FilterableTask = {
  title: string;
  project: string;
  notes: string;
  priority: string;
  status: string;
  due: string;
  labels?: string[];
};

export function filterTasks<TaskType extends FilterableTask>(tasks: TaskType[], filters: TaskFilterValues): TaskType[] {
  const query = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    const matchesSearch = !query || `${task.title} ${task.project} ${task.notes} ${(task.labels ?? []).join(" ")}`.toLowerCase().includes(query);
    const matchesPriority = filters.priority === "All" || task.priority === filters.priority;
    const matchesProject = filters.project === "All" || task.project === filters.project;
    const matchesStatus = filters.status === "All" || task.status === filters.status;
    const matchesDue = filters.due === "All" || task.due === filters.due;
    const matchesLabel = !filters.label || filters.label === "All" || (task.labels ?? []).includes(filters.label);

    return matchesSearch && matchesPriority && matchesProject && matchesStatus && matchesDue && matchesLabel;
  });
}
