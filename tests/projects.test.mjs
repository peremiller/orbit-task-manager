import assert from "node:assert/strict";
import test from "node:test";
import { tasksForEnabledProjects } from "../lib/projects.ts";

const project = (name, disabled) => ({ id: name, name, color: "#2457ff", description: "", ...(disabled === undefined ? {} : { disabled }) });

test("existing workspaces and unassigned tasks stay visible", () => {
  const tasks = [{ id: 1, project: "Legacy" }, { id: 2, project: "Unlisted" }, { id: 3, project: "" }];
  assert.deepEqual(tasksForEnabledProjects(tasks, [project("Legacy")]), tasks);
});

test("disable and re-enable preserve task identity, completion, and attachments", () => {
  const tasks = [
    { id: 1, project: "Pause", completed: false, notes: "Keep this", attachments: [{ id: "file-1" }] },
    { id: 2, project: "Pause", completed: true, completedAt: "2026-10-23T00:00:00Z" },
    { id: 3, project: "Keep active", completed: false },
  ];
  const original = structuredClone(tasks);
  const disabled = [project("Pause", true), project("Keep active", false)];
  assert.deepEqual(tasksForEnabledProjects(tasks, disabled), [tasks[2]]);
  const restored = tasksForEnabledProjects(tasks, disabled.map((item) => ({ ...item, disabled: false })));
  assert.deepEqual(restored, original);
  assert.equal(restored[0], tasks[0]);
  assert.deepEqual(tasks, original);
});

test("all projects can be disabled without removing stored work", () => {
  const tasks = [{ id: 1, project: "Only project" }];
  assert.deepEqual(tasksForEnabledProjects(tasks, [project("Only project", true)]), []);
  assert.equal(tasks.length, 1);
});
