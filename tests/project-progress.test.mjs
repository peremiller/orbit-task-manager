import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectProgress, completionDateKey, moveProgressPeriod, progressToday, progressWindow, summarizeProgressRows } from "../lib/project-progress.ts";
import { filterProjectCategory, groupProjectsByCategory } from "../lib/projects.ts";

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

test("category completion weights applicable tasks and preserves empty and N/A-only bundles", () => {
  const categorized = projects.map(project => ({ ...project, category: "Shared theme" }));
  const source = [task(1, "A", "2026-10-05"), ...Array.from({ length: 9 }, (_, i) => task(i + 2, "B", undefined, false)), { ...task(11, "B", "2026-10-05"), status: "na" }];
  const result = buildProjectProgress(source, categorized, options);
  const total = summarizeProgressRows(result.rows);
  assert.equal(total.percent, 10); // 1/10; averaging 100% and 0% would incorrectly give 50%.
  assert.equal(total.periodCompleted, 1);
  assert.equal(total.open, 9);
  assert.equal(total.notApplicable, 1);
  assert.equal(total.counts.reduce((sum, count) => sum + count, 0), 1);
  assert.equal(summarizeProgressRows(buildProjectProgress([], categorized, options).rows).percent, null);
  const naOnly = summarizeProgressRows(buildProjectProgress(source.filter(task => task.status === "na"), categorized, options).rows);
  assert.equal(naOnly.percent, null);
  assert.equal(naOnly.notApplicable, 1);
  assert.equal(naOnly.periodCompleted, 0);
  assert.equal(summarizeProgressRows([]).percent, null);
});

test("category bundles and timeline columns reconcile for every period and filter", () => {
  const categorized = projects.map((project, index) => ({ ...project, category: index ? "Custom second theme" : "Custom first theme" }));
  for (const period of ["week", "month", "quarter", "year"]) {
    for (const status of ["all", "active", "disabled"]) {
      for (const category of ["", "Custom first theme", "Custom second theme"]) {
        const scope = filterProjectCategory(tasks, categorized, category);
        const data = buildProjectProgress(scope.tasks, scope.projects, { ...options, period, status });
        const groups = groupProjectsByCategory(data.rows.map(row => ({ ...row.project, row }))).map(group => summarizeProgressRows(group.projects.map(project => project.row)));
        assert.equal(groups.reduce((sum, group) => sum + group.periodCompleted, 0), data.totalCompleted);
        assert.equal(groups.reduce((sum, group) => sum + group.open, 0), data.openTasks);
        assert.equal(groups.reduce((sum, group) => sum + group.counts.reduce((s, n) => s + n, 0), 0), data.totalCompleted);
        for (let index = 0; index < data.buckets.length; index++) assert.equal(groups.reduce((sum, group) => sum + group.counts[index], 0), data.rows.reduce((sum, row) => sum + row.counts[index], 0));
      }
    }
  }
});

test("multi-day columns use the requested October 23 anchor without restarting at period boundaries", () => {
  for (const columnDays of [2, 3]) {
    const result = buildProjectProgress([], projects, { ...options, columnDays });
    const batch = result.buckets.find(bucket => bucket.start === "2026-10-23");
    assert.equal(batch.end, columnDays === 2 ? "2026-10-24" : "2026-10-25");
    assert.equal(result.buckets.find(bucket => bucket.start === (columnDays === 2 ? "2026-10-25" : "2026-10-26")).end, columnDays === 2 ? "2026-10-26" : "2026-10-28");
    assert.equal(result.buckets.find(bucket => bucket.start === (columnDays === 2 ? "2026-10-27" : "2026-10-29")).end, columnDays === 2 ? "2026-10-28" : "2026-10-31");
    for (const anchor of ["2026-01-01", "2026-11-01", "2027-01-01", "2024-02-29"]) {
      const data = buildProjectProgress([], projects, { ...options, anchor, columnDays });
      assert.ok(data.buckets[0].start <= data.start);
      assert.ok(data.buckets.at(-1).end >= data.end);
      for (const [index, bucket] of data.buckets.entries()) {
        const daysFromAnchor = (Date.parse(bucket.start) - Date.parse("2026-10-23")) / 86_400_000;
        assert.equal(Math.abs(daysFromAnchor % columnDays), 0);
        assert.equal((Date.parse(bucket.end) - Date.parse(bucket.start)) / 86_400_000, columnDays - 1);
        if (index) assert.equal(Date.parse(bucket.start) - Date.parse(data.buckets[index - 1].end), 86_400_000);
      }
    }
  }
});

test("multi-day counts reconcile across filters and exclude outside-period, future and N/A records", () => {
  const source = [task(1, "A", "2026-10-23"), task(2, "A", "2026-10-24"), task(3, "A", "2026-10-25"), task(4, "B", "2026-10-26"), task(5, "A", "2026-11-01"), { ...task(6, "A", "2026-10-24"), status: "na" }];
  for (const columnDays of [2, 3]) {
    for (const period of ["week", "month", "quarter", "year"]) {
      for (const status of ["all", "active", "disabled"]) {
        for (const projectId of ["", "a", "b"]) {
          const settings = { ...options, today: "2026-10-26", columnDays, period, status, projectId };
          const result = buildProjectProgress(source, projects, settings);
          const original = buildProjectProgress(source, projects, { ...settings, columnDays: undefined });
          assert.deepEqual(result.completions, original.completions);
          assert.deepEqual(result.days, original.days);
          assert.deepEqual(result.weekdays, original.weekdays);
          const summary = summarizeProgressRows(result.rows);
          assert.equal(summary.counts.reduce((sum, count) => sum + count, 0), result.totalCompleted);
          assert.equal(result.openTasks, original.openTasks);
        }
      }
    }
    const month = buildProjectProgress(source, projects, { ...options, today: "2026-11-02", columnDays });
    assert.equal(month.totalCompleted, 4); // November 1 never leaks into October's boundary column.
    const now = buildProjectProgress(source, projects, { ...options, today: "2026-10-24", columnDays });
    const index = now.buckets.findIndex(bucket => bucket.start === "2026-10-23");
    assert.equal(now.buckets[index].future, false);
    assert.equal(now.rows[0].counts[index], 2);
    const future = buildProjectProgress(source, projects, { ...options, anchor: "2026-11-01", today: "2026-10-31", columnDays });
    assert.ok(future.buckets.every(bucket => bucket.future));
  }
});

test("single dates and inclusive custom ranges drive the same category completions as the timelines", () => {
  assert.deepEqual(progressWindow("2026-10-23", "day"), { start: "2026-10-23", end: "2026-10-23" });
  assert.deepEqual(progressWindow("2026-10-23", "range", "2026-11-02"), { start: "2026-10-23", end: "2026-11-02" });
  assert.throws(() => progressWindow("2026-10-23", "range", "2026-10-22"));
  assert.throws(() => progressWindow("2026-10-23", "range", "2026-02-30"));
  assert.equal(moveProgressPeriod("2026-12-31", "day", 1), "2027-01-01");
  assert.equal(moveProgressPeriod("2026-10-23", "range", 1, "2026-10-25"), "2026-10-26");
  assert.equal(moveProgressPeriod("2026-10-23", "range", -1, "2026-10-25"), "2026-10-20");
  const categorized = projects.map(project => ({ ...project, category: project.id === "a" ? "Learning" : "Work" }));
  const source = [task(1, "A", "2026-10-22T15:59:59Z"), task(2, "A", "2026-10-22T16:00:00Z"), task(3, "B", "2026-10-25T15:59:59Z"), task(4, "B", "2026-10-25T16:00:00Z")];
  for (const columnDays of [undefined, 2, 3]) {
    const day = buildProjectProgress(source, categorized, { ...options, period: "day", today: "2026-10-30", columnDays });
    assert.deepEqual(day.completions.map(item => item.task.id), [2]);
    const range = buildProjectProgress(source, categorized, { ...options, period: "range", rangeEnd: "2026-10-25", today: "2026-10-30", columnDays });
    assert.deepEqual(range.completions.map(item => item.task.id), [2, 3]);
    assert.equal(summarizeProgressRows(range.rows).counts.reduce((sum, value) => sum + value, 0), 2);
    const groups = groupProjectsByCategory(range.rows.map(row => ({ ...row.project, row })));
    assert.deepEqual(groups.map(group => [group.name, summarizeProgressRows(group.projects.map(project => project.row)).periodCompleted]), [["Learning", 1], ["Work", 1]]);
    const filtered = filterProjectCategory(source, categorized, "Learning");
    assert.equal(buildProjectProgress(filtered.tasks, filtered.projects, { ...options, period: "range", rangeEnd: "2026-10-25", today: "2026-10-30", columnDays }).totalCompleted, 1);
  }
});
