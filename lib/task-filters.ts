export type TaskFilterValues = {
  search: string;
  priority: string;
  projects: string[];
  status: string;
  due: string;
  label?: string;
};

const PROJECT_FILTER_QUERY_KEY = "project";

export function normalizeProjectFilterQuery(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.map((project) => project.trim()).filter(Boolean)));
}

export function projectFilterHref(href: string, projects: string[]): string {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
  const hrefWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const queryIndex = hrefWithoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? hrefWithoutHash.slice(0, queryIndex) : hrefWithoutHash;
  const params = new URLSearchParams(queryIndex >= 0 ? hrefWithoutHash.slice(queryIndex + 1) : "");

  params.delete(PROJECT_FILTER_QUERY_KEY);
  normalizeProjectFilterQuery(projects).forEach((project) => params.append(PROJECT_FILTER_QUERY_KEY, project));

  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

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
    const matchesProject = filters.projects.length === 0 || filters.projects.includes(task.project);
    const matchesStatus = filters.status === "All" || task.status === filters.status;
    const matchesDue = filters.due === "All" || task.due === filters.due;
    const matchesLabel = !filters.label || filters.label === "All" || (task.labels ?? []).includes(filters.label);

    return matchesSearch && matchesPriority && matchesProject && matchesStatus && matchesDue && matchesLabel;
  });
}
