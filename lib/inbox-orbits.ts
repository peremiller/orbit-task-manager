import { completionDateKey, progressProjects, type ProgressTask } from "./project-progress";
import { groupProjectsByCategory, projectCategory, type Project } from "./projects";

export const INBOX_ORBIT_STATUSES = [{ value: "todo", label: "Not Started" }, { value: "in-progress", label: "In Progress" }, { value: "done", label: "Complete" }] as const;
const COLORS = ["#2457ff", "#8256d0", "#11826a", "#a66a13", "#bf5279", "#087e9d", "#967135", "#7153a8", "#596779"];

export function buildInboxOrbits(tasks: ProgressTask[], projects: Project[], options: { category?: string; completionWindow?: { start: string; end: string }; today?: string } = {}) {
  const groups = groupProjectsByCategory(progressProjects(tasks, projects));
  const byProject = new Map(groups.flatMap(group => group.projects.map(project => [project.name, group.name] as const)));
  return INBOX_ORBIT_STATUSES.map(status => {
    const matching = tasks.filter(task => {
      if (task.status === "na") return false;
      if (options.category && byProject.get(task.project) !== options.category) return false;
      const current = task.completed || task.status === "done" ? "done" : task.status === "in-progress" ? "in-progress" : "todo";
      if (current !== status.value) return false;
      if (status.value === "done" && options.completionWindow) {
        const date = completionDateKey(task.completedAt);
        return date !== null && date >= options.completionWindow.start && date <= options.completionWindow.end && (!options.today || date <= options.today);
      }
      return true;
    });
    const counts = new Map<string, number>();
    matching.forEach(task => { const name = byProject.get(task.project) ?? projectCategory({ name: task.project }); counts.set(name, (counts.get(name) ?? 0) + 1); });
    return { ...status, total: matching.length, categories: groups.filter(group => !options.category || group.name === options.category).map(group => ({
      name: group.name, count: counts.get(group.name) ?? 0, projects: group.projects.length, color: COLORS[groups.indexOf(group) % COLORS.length],
    })) };
  });
}
