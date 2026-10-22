import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectProgress, completionDateKey, moveProgressPeriod, progressToday, progressWindow } from "../lib/project-progress.ts";

const projects = [{ id: "a", name: "A", color: "#2457ff", description: "" }, { id: "b", name: "B", color: "#8f5dff", description: "", disabled: true }];
const task = (id, project, completedAt, completed = true) => ({ id, title: `Task ${id}`, project, completed, completedAt });
const tasks = [
  task(1, "A", "2026-10-04T16:30:00Z"), // Monday Oct 5 in Manila.
  task(2, "A", "2026-10-05T15:59:59Z"),
  task(3, "B", "2026-10-11T16:00:00Z"),
  task(4, "B", "2026-09-30T16:00:00Z"),
  task(5, "A", undefined), task(6, "A", "invalid"),
  task(7, "A", "2026-10-05T00:00:00Z", false),
  task(8, "A", "2026-10-24T00:00:00Z"),
  task(9, "A", "2026-09-01T00:00:00Z"),
];
const options = { period: "month", anchor: "2026-10-23", today: "2026-10-23" };

test("period boundaries use Monday weeks, exact quarters, year boundaries and leap days", () => {
  assert.deepEqual(progressWindow("2026-01-01", "week"), { start: "2025-12-29", end: "2026-01-04" });
  assert.deepEqual(progressWindow("2024-02-23", "month"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(progressWindow("2026-10-23", "quarter"), { start: "2026-10-01", end: "2026-12-31" });
  assert.deepEqual(progressWindow("2026-10-23", "year"), { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(moveProgressPeriod("2026-12-31", "month", 1), "2027-01-01");
  assert.equal(moveProgressPeriod("2026-01-01", "quarter", -1), "2025-10-01");
  assert.throws(() => progressWindow("2026-02-30", "month"));
});

test("completion dates and today use Manila midnight rather than UTC", () => {
  assert.equal(completionDateKey("2026-10-04T16:30:00Z"), "2026-10-05");
  assert.equal(completionDateKey("2026-10-05T15:59:59Z"), "2026-10-05");
  assert.equal(progressToday(new Date("2026-10-22T23:00:00Z")), "2026-10-23");
  assert.equal(completionDateKey("2026-02-30"), null);
});

test("period totals reconcile with days, weekdays, projects and all comparison columns", () => {
  const result = buildProjectProgress(tasks, projects, options);
  assert.equal(result.totalCompleted, 4);
  assert.equal(result.activeDays, 3);
  assert.equal(result.projectsProgressed, 2);
  assert.equal(result.undatedCompleted, 2);
  assert.equal(result.openTasks, 1);
  assert.equal(result.weekdays[0].count, 3);
  for (const total of [result.days.reduce((sum, day) => sum + day.count, 0), result.weekdays.reduce((sum, day) => sum + day.count, 0), result.rows.reduce((sum, row) => sum + row.periodCompleted, 0), result.rows.reduce((sum, row) => sum + row.counts.reduce((s, n) => s + n, 0), 0)]) assert.equal(total, 4);
  assert.equal(result.days.find((day) => day.date === "2026-10-24").future, true);
  assert.equal(result.days.find((day) => day.date === "2026-10-24").count, 0);
});

test("project and status filters change every series; All restores the full population", () => {
  const onlyA = buildProjectProgress(tasks, projects, { ...options, projectId: "a" });
  const disabled = buildProjectProgress(tasks, projects, { ...options, status: "disabled" });
  assert.equal(onlyA.totalCompleted, 2);
  assert.equal(onlyA.rows.length, 1);
  assert.equal(disabled.totalCompleted, 2);
  assert.equal(disabled.undatedCompleted, 0);
  assert.equal(buildProjectProgress(tasks, projects, { ...options, status: "all", projectId: "" }).totalCompleted, onlyA.totalCompleted + disabled.totalCompleted);
});

test("quarter and year include older retained completions and aggregate them without duplication", () => {
  const quarter = buildProjectProgress(tasks, projects, { ...options, period: "quarter" });
  const year = buildProjectProgress(tasks, projects, { ...options, period: "year" });
  assert.equal(quarter.totalCompleted, 4);
  assert.equal(year.totalCompleted, 5);
  assert.equal(year.buckets.length, 12);
  assert.equal(year.rows.reduce((sum, row) => sum + row.counts[8], 0), 1);
  assert.equal(year.rows.reduce((sum, row) => sum + row.counts[9], 0), 4);
  assert.equal(quarter.rows.reduce((sum, row) => sum + row.counts.reduce((s, n) => s + n, 0), 0), 4);
});

test("undated, unlisted, empty, and future records stay explicit", () => {
  const result = buildProjectProgress([task(1, "Unlisted", "2026-10-05"), task(2, "", "2026-10-05")], [], options);
  assert.equal(result.rows.length, 2);
  assert.equal(result.totalCompleted, 2);
  const empty = buildProjectProgress([], projects, { ...options, period: "year" });
  assert.equal(empty.rows[0].percent, null);
  const future = buildProjectProgress(tasks, projects, { ...options, anchor: "2027-02-01" });
  assert.equal(future.totalCompleted, 0);
  assert.ok(future.days.every((day) => day.future));
});
