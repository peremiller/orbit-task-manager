# Orbit Task Manager

A calm, modern task management experience for clear priorities, focused work, and visible momentum.

## Highlights

- Today, Inbox, Upcoming, Board, Projects, Insights, and Completed views
- Goals workspace with optional task-to-goal alignment, progress, target dates, and inline goal creation
- Real-time Mind Map and weighted Word Map views of every open task, grouped by goal
- Task creation, editing, deletion, search, filtering, and completion
- Spreadsheet-style default view in Inbox, Upcoming, Planner, and Completed with a black header, gridlines, and gray/amber/green status dropdowns
- Five shared columns: Workstream (project), Task, Status, Date Completed, and Remarks (notes); inline task/remarks edits and workstream selection use existing workspace sync
- Completion dates and recurring-task behavior stay shared with the other views; switch back to List, Timeline, or Capacity at any time
- Drag-and-drop workflow board
- Sticky-note Kanban at `/kanban` with up to 30 editable columns: names, descriptions, colors, and To do / In progress / Done behavior
- Drag column grips to reorder, or use each column’s left/right buttons; column settings and task placements sync with the account workspace
- Delete columns by moving their tasks to a selected destination, including tasks hidden by filters; keep at least one column
- Add images and files with each note’s paperclip button; file picker, drag-and-drop, and pasted images are supported (20 files per task, 3 MB per file)
- Private attachment storage in the existing Postgres database, authenticated previews/downloads, and image thumbnails on notes
- Todoist-style quick capture with dates, times, priorities, labels, estimates, recurrence, and project tokens
- Recurring tasks that create the next occurrence automatically
- Subtasks with completion progress and workspace-wide labels
- Smart filters for priorities, quick wins, deep work, recurring work, active work, and someday items
- Capacity planner with daily effort totals and overload warnings
- Focus timer and keyboard shortcuts
- Responsive light and dark themes with saved preferences
- Account-specific cloud sync with offline caching and cross-device updates
- Interconnected Actuals, Effort Plan, Timesheet Report, and Dashboard pages
- Weekly, fortnightly, sprint, monthly, quarterly, and custom multi-week reporting views
- Configurable sprint names, start dates, and end dates in Selection Manager
- Seven-day Actuals and editable Timesheet grids with test case and bug counts
- Exactly-45-hour Timesheet normalization with Innovation excluded from the total
- Utilization reporting for Test Planning and Test Execution work
- Advance leave/holiday and utilized-work entry directly from Timesheet Report
- Official 2026 Philippine regular and special non-working holidays seeded by default
- Central Selection Manager for workstreams, task types, phases, applications, frequencies, and leave types
- One formula-driven six-tab Excel workbook per selected week, with multi-week batch export

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Kanban columns are retained in `orbit_workspaces.kanban_columns` and workspace history. The additive schema migrations run through the existing database initialization. Attachment bytes live in `orbit_task_attachments`; task records contain only small attachment references. Removing an attachment from a task retains the stored file for recurring copies and archived workspace references.

## Validation

```bash
npm run lint
npm run build
```
