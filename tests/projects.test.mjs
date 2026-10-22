import assert from "node:assert/strict";
import test from "node:test";
import { mergeProjects, projectForId, projectMergeError, remapMergedTaskProjects, tasksForEnabledProjects } from "../lib/projects.ts";
import { mergeRecoveredProjects, mergeRecoveredTasks } from "../lib/workspace-recovery.ts";

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

test("merge multiple projects into an existing target without changing task detail or IDs", () => {
  const projects = [project("A"), project("B", true), project("C"), project("Keep")];
  const tasks = projects.map((item, index) => ({ id: index + 1, title: "Same task title", project: item.name, completed: index === 1, completedAt: index === 1 ? "2026-10-22T16:30:00Z" : undefined, attachments: [{ id: `file-${index}` }], goalId: "goal", kanbanColumnId: "doing", subtasks: [{ id: index + 10, completed: false }] }));
  const originals = structuredClone({ projects, tasks });
  const result = mergeProjects(tasks, projects, { projectIds: ["A", "B", "C"], destinationId: "A", name: "Combined", disabled: false });
  assert.equal(result.projects.length, 2);
  assert.equal(result.tasks.length, tasks.length);
  assert.deepEqual(result.tasks.map((item) => item.project), ["Combined", "Combined", "Combined", "Keep"]);
  result.tasks.forEach((item, index) => assert.deepEqual({ ...item, project: tasks[index].project }, tasks[index]));
  assert.deepEqual({ projects, tasks }, originals);
  assert.equal(result.projects[1], projects[3]);
  assert.equal(result.tasks[3], tasks[3]);
  assert.equal(projectForId(result.projects, "B").id, "A");
  assert.deepEqual(result.destination.mergedFrom.map((item) => item.name), ["A", "B", "C"]);
});

test("new combined destination keeps source descriptions and chosen disabled status", () => {
  const projects = [project("A"), project("B")].map((item) => ({ ...item, description: `${item.name} context` }));
  const result = mergeProjects([{ project: "A" }, { project: "B" }], projects, { projectIds: ["A", "B"], destinationId: null, name: "  New outcome  ", disabled: true }, "new-outcome");
  assert.equal(result.projects.length, 1);
  assert.equal(result.destination.name, "New outcome");
  assert.equal(result.destination.description, "A context\nB context");
  assert.equal(result.destination.disabled, true);
  assert.equal(tasksForEnabledProjects(result.tasks, result.projects).length, 0);
});

test("invalid or stale selections cannot change a workspace", () => {
  const projects = [project("A"), project("B"), project("Other")];
  const request = { projectIds: ["A", "B"], destinationId: "A", name: "Combined", disabled: false };
  for (const change of [{ projectIds: ["A", "A"] }, { projectIds: ["A", "missing"] }, { destinationId: "Other" }, { name: "other" }, { name: " " }]) {
    assert.ok(projectMergeError(projects, { ...request, ...change }));
    assert.throws(() => mergeProjects([], projects, { ...request, ...change }));
  }
  assert.throws(() => mergeProjects([], projects, { ...request, destinationId: null }, "Other"));
});

test("successive merges retain bookmark aliases and old browser backups do not recreate sources", () => {
  const projects = [project("A"), project("B"), project("C")];
  const legacy = [{ id: 1, title: "Kept task", project: "B", due: "Today", time: "9:00 AM" }];
  const first = mergeProjects(legacy, projects, { projectIds: ["A", "B"], destinationId: "A", name: "AB", disabled: false });
  const final = mergeProjects(first.tasks, first.projects, { projectIds: ["A", "C"], destinationId: "C", name: "ABC", disabled: false });
  assert.equal(projectForId(final.projects, "B").name, "ABC");
  assert.deepEqual(mergeRecoveredProjects(final.projects, projects), final.projects);
  assert.equal(mergeRecoveredTasks(final.tasks, remapMergedTaskProjects(legacy, final.projects)).length, 1);
  assert.equal(final.tasks[0].project, "ABC");
});
