export type KanbanStatus = "todo" | "in-progress" | "done" | "na";
export type KanbanColumn = { id: string; title: string; description: string; color: string; status: KanbanStatus };

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "todo", title: "To do", description: "Ideas ready for their moment", color: "#c38c13", status: "todo" },
  { id: "in-progress", title: "In progress", description: "A little closer every day", color: "#3564c5", status: "in-progress" },
  { id: "done", title: "Done", description: "Small wins, real momentum", color: "#208062", status: "done" },
  { id: "na", title: "N/A", description: "Kept for reference, outside planned work", color: "#737985", status: "na" },
];
export const KANBAN_STATUS_LABELS = { todo: "To do", "in-progress": "In progress", done: "Done", na: "N/A" };

export function parseKanbanColumns(value: unknown): KanbanColumn[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 31) return null;
  const ids = new Set<string>();
  const columns: KanbanColumn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const c = item as Partial<KanbanColumn>;
    if (typeof c.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || ids.has(c.id)
      || typeof c.title !== "string" || !c.title.trim() || c.title.trim().length > 80
      || typeof c.description !== "string" || c.description.length > 300
      || typeof c.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(c.color)
      || !["todo", "in-progress", "done", "na"].includes(c.status ?? "")) return null;
    ids.add(c.id);
    columns.push({ id: c.id, title: c.title.trim(), description: c.description.trim(), color: c.color, status: c.status as KanbanStatus });
  }
  return columns.length === 31 && !columns.some(c => c.status === "na") ? null : columns;
}

export function normalizeKanbanColumns(value: unknown): KanbanColumn[] {
  const columns = parseKanbanColumns(value) ?? DEFAULT_KANBAN_COLUMNS.map(c => ({ ...c }));
  if (!columns.some(c => c.status === "na")) {
    let id = "na";
    while (columns.some(c => c.id === id)) id += "-";
    columns.push({ ...DEFAULT_KANBAN_COLUMNS[3], id });
  }
  return columns;
}

export function taskColumnId(task: { status: KanbanStatus; completed: boolean; kanbanColumnId?: string }, columns: KanbanColumn[]): string {
  const status = task.completed ? "done" : task.status;
  const assigned = columns.find(c => c.id === task.kanbanColumnId && c.status === status);
  return assigned?.id ?? columns.find(c => c.status === status)?.id ?? columns[0].id;
}

export function reorderKanbanColumns(columns: KanbanColumn[], sourceId: string, targetId: string): KanbanColumn[] {
  const from = columns.findIndex(c => c.id === sourceId);
  const to = columns.findIndex(c => c.id === targetId);
  if (from < 0 || to < 0 || from === to) return columns;
  const next = [...columns];
  const [column] = next.splice(from, 1);
  next.splice(to, 0, column);
  return next;
}
