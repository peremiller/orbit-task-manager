import assert from "node:assert/strict";
import test from "node:test";
import { applyProjectCategoryAssignments, filterProjectCategory, groupProjectsByCategory, initializeProjectCategories, mergeProjects, PROJECT_CATEGORIES, projectCategory, suggestProjectCategory } from "../lib/projects.ts";
import { buildProjectProgress } from "../lib/project-progress.ts";

const project = (id, name, extra = {}) => ({ id, name, color: "#2457ff", description: "Keep context", ...extra });

test("theme suggestions cover the current kinds of priorities and resolve overlapping topics", () => {
  const samples = [["ARC - Facilities", 0], ["LLC - Compliance", 0], ["Program testing", 0], ["Estimation and reports", 0], ["Test automation", 0], ["Innovation showcase", 1], ["App portfolio and bots", 1], ["New business", 1], ["Property operations", 2], ["Grocery planning", 2], ["Monthly bills", 3], ["Investment and safe assets", 3], ["Financial planning", 3], ["Exercise and health", 4], ["Sleep routine", 4], ["Keloid care", 4], ["Nutrition", 4], ["Hygiene", 4], ["Cybersecurity certification", 5], ["Toastmasters practice", 5], ["International career opportunities", 5], ["Family leisure", 6], ["Church activities", 7], ["Security planning", 8]];
  for (const [name, index] of samples) assert.equal(suggestProjectCategory(name), PROJECT_CATEGORIES[index], name);
  assert.equal(suggestProjectCategory("A completely new topic"), "Other Priorities");
});

test("one-time categorization preserves metadata, disabled projects, custom themes and JSON persistence", () => {
  const source = [project("a", "Health plan"), project("b", "Property operations", { disabled: true, category: "My custom theme", mergedFrom: [{ id: "old", name: "Legacy" }] }), project("c", "Bills", { category: "Uncategorized" })];
  const original = structuredClone(source);
  const categorized = initializeProjectCategories(source);
  assert.deepEqual(source, original);
  assert.equal(categorized[0].category, PROJECT_CATEGORIES[4]);
  assert.equal(categorized[1], source[1]);
  assert.equal(categorized[2], source[2]);
  assert.equal(initializeProjectCategories(categorized), categorized);
  const saved = JSON.parse(JSON.stringify(categorized));
  assert.deepEqual(saved, categorized);
  assert.equal(projectCategory({ ...saved[0], name: "Renamed to a different topic" }), PROJECT_CATEGORIES[4]);
  assert.deepEqual(saved.map(p => p.id), source.map(p => p.id));
});

test("parent groups contain every project exactly once, including disabled children", () => {
  const projects = initializeProjectCategories([project("a", "Bills"), project("b", "Investments", { disabled: true }), project("c", "Fitness")]);
  const groups = groupProjectsByCategory(projects);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.flatMap(group => group.projects).map(p => p.id).sort(), ["a", "b", "c"]);
  assert.equal(groups.find(g => g.name === PROJECT_CATEGORIES[3]).projects.length, 2);
});

test("category assignment and rename retain project identity and support custom or ungrouped themes", () => {
  const projects = initializeProjectCategories([project("a", "Bills"), project("b", "Health plan"), project("c", "Training")]);
  const result = applyProjectCategoryAssignments(projects, [{ projectId: "a", category: "  Shared   theme " }, { projectId: "b", category: "shared theme" }]);
  assert.equal(result[0].category, "Shared theme");
  assert.equal(result[1].category, "Shared theme");
  assert.equal(result[2], projects[2]);
  assert.deepEqual(result.map(({ category, ...rest }) => rest), projects.map(({ category, ...rest }) => rest));
  const renamed = applyProjectCategoryAssignments(result, result.slice(0, 2).map(p => ({ projectId: p.id, category: "New parent name" })));
  assert.equal(groupProjectsByCategory(renamed).find(g => g.name === "New parent name").projects.length, 2);
  assert.equal(applyProjectCategoryAssignments(renamed, [{ projectId: "a", category: "Uncategorized" }])[0].category, "Uncategorized");
});

test("invalid or stale category edits are rejected before changing any projects", () => {
  const projects = initializeProjectCategories([project("a", "Bills")]);
  const before = structuredClone(projects);
  for (const assignments of [[{ projectId: "missing", category: "New" }], [{ projectId: "a", category: " " }], [{ projectId: "a", category: "x".repeat(61) }], [{ projectId: "a", category: "One" }, { projectId: "a", category: "Two" }]]) assert.throws(() => applyProjectCategoryAssignments(projects, assignments));
  assert.deepEqual(projects, before);
});

test("merging across parents retains source categories and uses the chosen destination theme", () => {
  const projects = initializeProjectCategories([project("a", "Bills"), project("b", "Property operations")]);
  const tasks = [{ id: 1, project: "Bills", status: "na", notes: "Keep me" }, { id: 2, project: "Property operations", completed: true }];
  const request = { projectIds: ["a", "b"], destinationId: "b", name: "Combined operations", disabled: false };
  const merged = mergeProjects(tasks, projects, request);
  assert.equal(merged.destination.category, PROJECT_CATEGORIES[2]);
  assert.deepEqual(merged.destination.mergedFrom.map(p => p.category), projects.map(p => p.category));
  assert.equal(merged.tasks[0].status, "na");
  assert.equal(merged.tasks[0].notes, "Keep me");
  assert.equal(mergeProjects(tasks, projects, { ...request, destinationId: null, category: "Custom parent" }, "new").destination.category, "Custom parent");
});

test("parent filtering reconciles all progress series and clearing it restores the full scope", () => {
  const projects = initializeProjectCategories([project("a", "Bills"), project("b", "Property operations", { disabled: true })]);
  const tasks = [{ id: 1, title: "A", project: "Bills", completed: true, completedAt: "2026-10-22T03:00:00Z" }, { id: 2, title: "B", project: "Property operations", completed: false }, { id: 3, title: "C", project: "Bills", status: "na", completed: false }];
  const scope = filterProjectCategory(tasks, projects, PROJECT_CATEGORIES[3]);
  assert.deepEqual(scope.tasks.map(t => t.id), [1, 3]);
  const report = buildProjectProgress(scope.tasks, scope.projects, { period: "month", anchor: "2026-10-23", today: "2026-10-23" });
  assert.equal(report.totalCompleted, 1);
  assert.equal(report.openTasks, 0);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].percent, 100);
  assert.equal(report.weekdays.reduce((sum, day) => sum + day.count, 0), report.totalCompleted);
  assert.equal(filterProjectCategory(tasks, projects, "").tasks, tasks);
  assert.equal(filterProjectCategory(tasks, projects, "").projects, projects);
  assert.equal(filterProjectCategory(tasks, projects, "Unknown parent").tasks.length, 0);
});
