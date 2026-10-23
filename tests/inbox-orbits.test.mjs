import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { changeTaskStatus } from "../lib/task-status.ts";
import { filterTasks } from "../lib/task-filters.ts";

// Match the app's bundler resolution while running TypeScript directly in Node.
const resolver = registerHooks({ resolve(specifier, context, next) {
  return next(specifier === "./projects" || specifier === "./project-progress" ? `${specifier}.ts` : specifier, context);
} });
const { buildInboxOrbits } = await import("../lib/inbox-orbits.ts");
resolver.deregister();

const projects = [{ id: "a", name: "A", category: "Work", color: "#2457ff", description: "" }, { id: "b", name: "B", category: "Life", color: "#11826a", description: "" }];
const task = (id, status, project = "A", extra = {}) => ({ id, title: `Task ${id}`, project, status, completed: status === "done", completedAt: status === "done" ? "2026-10-23T02:00:00Z" : undefined, priority: "High", due: "Today", notes: "", ...extra });

test("status orbits reconcile parent categories and keep N/A outside all three", () => {
  const tasks = [task(1, "todo"), task(2, "in-progress"), task(3, "done"), task(4, "todo", "B"), task(5, "na"), task(6, undefined, "B"), task(7, "todo", "A", { completed: true }), task(8, "done", "B", { completedAt: undefined })];
  const result = buildInboxOrbits(tasks, projects);
  assert.deepEqual(result.map(orbit => [orbit.label, orbit.total]), [["Not Started", 3], ["In Progress", 1], ["Complete", 3]]);
  for (const orbit of result) assert.equal(orbit.categories.reduce((sum, category) => sum + category.count, 0), orbit.total);
  assert.equal(result[0].categories.find(category => category.name === "Life").count, 2);
  const scoped = buildInboxOrbits(tasks, projects, { category: "Work" });
  assert.deepEqual(scoped.map(orbit => orbit.total), [1, 1, 2]);
  assert.ok(scoped.every(orbit => orbit.categories.length === 1));
  const empty = buildInboxOrbits([], projects);
  assert.deepEqual(empty.map(orbit => orbit.total), [0, 0, 0]);
  assert.ok(empty.every(orbit => orbit.categories.length === 2));
});

test("completion date selections leave current open states intact and honor Manila midnight", () => {
  const source = [task(1, "todo"), task(2, "in-progress"), task(3, "done", "A", { completedAt: "2026-10-22T16:00:00Z" }), task(4, "done", "A", { completedAt: "2026-10-22T15:59:59Z" }), task(5, "done", "B", { completedAt: undefined }), task(6, "done", "B", { completedAt: "2026-10-24" })];
  const range = buildInboxOrbits(source, projects, { completionWindow: { start: "2026-10-23", end: "2026-10-24" }, today: "2026-10-23" });
  assert.deepEqual(range.map(orbit => orbit.total), [1, 1, 1]);
  assert.equal(buildInboxOrbits(source, projects)[2].total, 4);
});

test("task transitions move exactly one task between orbit totals without mutating records", () => {
  let source = [task(1, "todo", "A", { attachments: [{ id: "keep" }] })];
  const original = structuredClone(source);
  const totals = tasks => buildInboxOrbits(tasks, projects).map(orbit => orbit.total);
  assert.deepEqual(totals(source), [1, 0, 0]);
  source = changeTaskStatus(source, 1, "in-progress");
  assert.deepEqual(totals(source), [0, 1, 0]);
  source = changeTaskStatus(source, 1, "done", { now: "2026-10-23T02:00:00Z" });
  assert.deepEqual(totals(source), [0, 0, 1]);
  source = changeTaskStatus(source, 1, "todo");
  assert.deepEqual(totals(source), [1, 0, 0]);
  assert.deepEqual(source[0].attachments, original[0].attachments);
});

test("Inbox filtering and unlisted projects preserve exact totals and category assignments", () => {
  const tasks = [task(1, "todo"), task(2, "done", "A", { priority: "Low" }), task(3, "in-progress", "Business launch")];
  const filtered = filterTasks(tasks, { search: "", priority: "High", projects: [], status: "All", due: "All", label: "All" });
  const result = buildInboxOrbits(filtered, projects);
  assert.deepEqual(result.map(orbit => orbit.total), [1, 1, 0]);
  assert.equal(result[1].categories.find(category => category.name === "Business & Innovation").count, 1);
  const colors = result.map(orbit => orbit.categories.map(category => category.color));
  assert.deepEqual(colors[0], colors[1]);
  assert.deepEqual(colors[1], colors[2]);
});
