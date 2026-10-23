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

Project Progress defaults to 2x Timeline, with Bundles, Timeline, 3x Timeline and Circular Orbit also available. Every parent card contains its child projects, completed-in-period and open task totals, and current completion weighted by applicable task count. Each child shows its own period completions, current completion and open tasks. View category activity scopes the charts and detail to that parent; All category bundles clears the category/project selection while retaining the period and status. The Timeline layout groups projects beneath collapsible parent rows, including summed category totals for every daily, weekly or monthly column. Collapsing rows only changes visibility, never the totals. CSV exports include the parent category for each completed task.

## Multi-day timelines

2x Timeline sums each two consecutive days; 3x Timeline sums each three consecutive days. Both use October 23, 2026 as a fixed first batch date, so the pairs are October 23–24, 25–26, 27–28, and the triples are October 23–25, 26–28, 29–31. The same sequence extends backwards and forwards across calendar and year boundaries; changing reference dates or periods never resets the alignment. All four periods retain two-/three-day columns in the corresponding view. Boundary columns display their full fixed range but count only completions within the selected period. Daily activity, weekday totals, details, CSV, current completion and all filters retain their existing definitions.

## Circular Orbit and date ranges

Circular Orbit shows completed-task counts and shares by parent category, with larger category nodes, stronger connections, a numbered category key and a strongest-pull summary. Every category remains visible, including those with no completions. Ties are identified. The key is keyboard accessible; selecting a category scopes the charts, detail and export through the existing filters. The view uses the same exact counts as the timelines, without inferring task duration, priority or scheduled work. Undated, future and N/A completions are excluded.

Day and Date range join Week, Month, Quarter and Year in the period controls. Custom ranges are inclusive and use Manila completion dates. The reference/start date moves the end forward when needed; the end date cannot precede the start. Previous/Next moves by a full inclusive custom range. All five views share these selections. 2x Timeline remains the initial default.

## Inbox orbit panel

Inbox displays three Circular Orbits to the right of both Sheet and List layouts on wide screens: Not Started, In Progress and Complete. Each uses current status and sums tasks by parent category. N/A tasks are excluded. The diagrams share category colors, category selection, and the Inbox search, priority, project, due and label filters, across enabled projects. The Inbox status filter controls the task workspace; the panel always compares all three statuses.

Complete defaults to All time, including undated completions. Its day, inclusive date range, week, month, quarter and year controls filter by Manila completion dates and exclude future/undated records when a period is selected. Not Started and In Progress show current state because historical status snapshots are not recorded. Legacy completed flags take precedence over open status values, and tasks without a status default to Not Started. Each status's category breakdown is expandable; category selection scopes all three charts and Show all categories restores comparison. Workspace task or category changes update the charts immediately. The panel links to full Project Progress. On narrow screens it stacks below the task workspace. No new writes or storage schema are introduced.
