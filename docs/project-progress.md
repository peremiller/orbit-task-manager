# Project merging and progress

Projects / Priorities offers a searchable merge dialog. Select two or more existing projects, use one selected destination or create a new combined name, choose active/disabled status, review the combined task count, and submit. The workspace's existing autosave persists the combined project and reassigned tasks in one payload. No task is deduplicated, deleted, or assigned a new ID, so attachments, goal links, Kanban placement, and work-reporting references remain intact. Source names, IDs, descriptions, colors, and prior status are retained in the destination's `mergedFrom` metadata. Source bookmarks and legacy browser recovery resolve to the combined project.

## Progress source and definitions

`/project-progress` reads the current authenticated workspace's `tasks` and `projects` from the existing `/api/workspace` state. There is no separate dataset, generated sample activity, or new external data service.

- Period windows are Monday–Sunday weeks, calendar months, calendar quarters, and calendar years.
- Completion dates use `completedAt`, converted to Asia/Manila calendar days. A task counts only while its `completed` flag is true.
- Completed-in-period, active days, projects progressed, daily activity, weekday totals, comparison columns, and detail rows use the same project/status/range population. Future days are shown separately and never contribute to completion totals.
- Week/month comparison columns show days; quarter columns show consecutive seven-day ranges within that quarter; year columns show calendar months. The calendar always preserves individual days.
- Current completion is currently completed tasks divided by all current tasks in a project. Open tasks now also uses the present task list, independent of the historical range. Empty project denominators display no tasks rather than an inferred percentage.
- Invalid or missing completion dates are counted in a visible coverage note and excluded from timelines. Unlisted project names and unassigned tasks receive explicit comparison rows so totals reconcile.
- A day selection filters only the completed-task detail and its CSV export. Project, status, and period filters apply to every period visualization. The CSV uses exactly the displayed detail population and escapes spreadsheet formulas.
- These are retained task records, not historical snapshots or an event log. Reopening/deleting tasks changes history; merging groups all retained completions under the destination project. Due-date achievement and targets are not inferred from relative due strings.

Verification: `npm run test:projects`, targeted ESLint, TypeScript, and production build. Tests cover lossless merges, stale selections, nested source aliases, legacy recovery, Manila midnight, leap days, calendar boundaries, all filter populations, future/undated records, and reconciliation between project/day/weekday/period totals.

N/A tasks remain in Inbox for reference and can be restored through their status selector. They are excluded from open work, completion percentages, completion charts, and karma. Marking a recurring task N/A does not create another occurrence.


## Parent categories

Projects carry an optional `category` string. On first load, Orbit assigns missing categories from project-name themes and saves them through the existing account workspace sync. Existing custom categories and explicit Uncategorized choices take precedence over suggestions. Parent categories organize projects without changing project IDs, task project references, disabled status, merged aliases, attachments, or task history.

Projects / Priorities and the sidebar group children under collapsible parent themes. Parent categories can be renamed in bulk, created by typing a new theme on an assigned project, or changed per project in project settings. Empty categories are not retained. New projects receive a suggested category unless an explicit one is supplied. A merge inherits the destination category unless the user chooses another; original categories are retained in merge metadata.

The Project Progress parent-category filter scopes the project selector, daily heatmap, weekday totals, current completion, detail and CSV export together. Category completion percentages are weighted by applicable task counts; N/A tasks are excluded. Disabled projects remain in their parent category and remain governed by the existing All / Active / Disabled filters.

The default Projects / Priorities layout is Bundles: each parent category is a compact card containing all its child projects, counts and weighted progress. View category details opens that parent’s detailed list, with a return to all bundles. List and Grid remain available. Sidebar parent folders start collapsed; the active project’s parent opens automatically.
