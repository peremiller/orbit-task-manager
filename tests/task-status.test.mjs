import assert from "node:assert/strict";
import test from "node:test";
import { changeTaskStatus, isActionableTask } from "../lib/task-status.ts";
import { DEFAULT_KANBAN_COLUMNS, normalizeKanbanColumns, parseKanbanColumns, taskColumnId } from "../lib/kanban.ts";
import { filterTasks } from "../lib/task-filters.ts";
import { buildProjectProgress } from "../lib/project-progress.ts";
import { computeKarma } from "../lib/karma.ts";

const task = { id: 1, title: "Optional weekly review", project: "A", status: "done", completed: true, completedAt: "2026-10-22T02:00:00Z", due: "Today", priority: "High", notes: "Keep context", labels: ["weekly"], recurrence: "weekly", attachments: [{ id: "receipt" }], subtasks: [{ id: 4, title: "Read notes", completed: true }], kanbanColumnId: "done" };

test("N/A preserves the complete record, clears completion, and survives saved JSON", () => {
  const untouched = { ...task, id: 2 };
  const input = [task, untouched];
  const before = structuredClone(input);
  let occurrences = 0;
  const output = changeTaskStatus(input, 1, "na", { nextOccurrence: () => { occurrences++; return null; } });
  assert.equal(occurrences, 0);
  assert.equal(output.length, 2);
  assert.deepEqual(input, before);
  assert.equal(output[1], untouched);
  assert.equal(isActionableTask(output[0]), false);
  const restored = JSON.parse(JSON.stringify(output))[0];
  assert.equal(restored.status, "na");
  assert.equal(restored.completed, false);
  assert.equal(restored.completedAt, undefined);
  assert.equal(restored.kanbanColumnId, undefined);
  for (const key of ["id", "title", "project", "notes", "labels", "recurrence", "attachments", "subtasks"]) assert.deepEqual(restored[key], task[key]);
});

test("restore from N/A and complete a recurring task exactly once", () => {
  let records = changeTaskStatus([{ ...task, status: "todo", completed: false }], 1, "na");
  records = changeTaskStatus(records, 1, "in-progress");
  assert.equal(isActionableTask(records[0]), true);
  let occurrences = 0;
  const options = { now: "2026-10-23T03:00:00Z", nextOccurrence: current => { occurrences++; return { ...current, id: 3, status: "todo", completed: false, completedAt: undefined }; } };
  records = changeTaskStatus(records, 1, "done", options);
  assert.equal(occurrences, 1);
  assert.equal(records.find(t => t.id === 1).completedAt, options.now);
  records = changeTaskStatus(records, 1, "done", options);
  assert.equal(occurrences, 1);
  assert.equal(records.length, 2);
  assert.equal(changeTaskStatus(records, 99, "na"), records);
});

test("N/A can be filtered without disappearing from All statuses", () => {
  const records = [task, { ...task, id: 2, status: "na", completed: false }];
  const scope = { search: "", priority: "All", projects: [], due: "All", status: "na" };
  assert.deepEqual(filterTasks(records, scope).map(t => t.id), [2]);
  assert.equal(filterTasks(records, { ...scope, status: "All" }).length, 2);
});

test("existing custom Kanban columns retain their IDs and placements while gaining N/A", () => {
  const legacy = DEFAULT_KANBAN_COLUMNS.filter(c => c.status !== "na").map((c, i) => ({ ...c, id: i === 0 ? "na" : c.id, title: `Custom ${i}` }));
  const original = structuredClone(legacy);
  const columns = normalizeKanbanColumns(legacy);
  assert.deepEqual(legacy, original);
  assert.deepEqual(columns.slice(0, legacy.length), original);
  const na = columns.find(c => c.status === "na");
  assert.notEqual(na.id, "na");
  assert.equal(taskColumnId({ ...task, status: "na", completed: false }, columns), na.id);
  assert.deepEqual(normalizeKanbanColumns(JSON.parse(JSON.stringify(columns))), columns);
  const thirty = Array.from({ length: 30 }, (_, i) => ({ ...legacy[0], id: `column-${i}` }));
  assert.equal(parseKanbanColumns(normalizeKanbanColumns(thirty)).length, 31);
});

test("N/A is excluded from open work, completion rates, chart totals and karma", () => {
  const na = { ...task, id: 3, status: "na", completed: true }; // Even inconsistent imported flags must not imply completion.
  const records = [task, { ...task, id: 2, status: "todo", completed: false, completedAt: undefined }, na];
  const progress = buildProjectProgress(records, [{ id: "a", name: "A", color: "#2457ff", description: "" }], { period: "month", anchor: "2026-10-23", today: "2026-10-23" });
  assert.equal(progress.totalCompleted, 1);
  assert.equal(progress.openTasks, 1);
  assert.equal(progress.rows[0].total, 2);
  assert.equal(progress.rows[0].percent, 50);
  assert.equal(progress.rows[0].notApplicable, 1);
  assert.equal(progress.weekdays.reduce((sum, day) => sum + day.count, 0), 1);
  assert.equal(computeKarma(records, 5, new Date("2026-10-23T12:00:00Z")).totalCompleted, 1);
});
