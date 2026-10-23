"use client";

import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Download, FolderTree, Orbit, Rows3, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { buildProjectProgress, completionLevel, moveProgressPeriod, progressDateLabel, progressProjects, progressToday, shiftProgressDay, summarizeProgressRows, PROGRESS_TIME_ZONE, WEEKDAY_NAMES, type ProgressPeriod } from "@/lib/project-progress";
import { filterProjectCategory, groupProjectsByCategory, projectCategory, projectCategoryNames, projectForId, type Project } from "@/lib/projects";
import { ProjectProgressOrbit } from "./project-progress-orbit";
import type { Task } from "./page";

const PERIODS: { value: ProgressPeriod; label: string }[] = [{ value: "day", label: "Day" }, { value: "range", label: "Date range" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }];
const BUNDLE_COLORS = ["#2457ff", "#8256d0", "#11826a", "#a66a13", "#bf5279", "#087e9d", "#967135", "#7153a8", "#596779"];

export function ProjectProgressView({ tasks, projects, initialProjectName, onEditTask }: { tasks: Task[]; projects: Project[]; initialProjectName?: string | null; onEditTask: (task: Task) => void }) {
  const [period, setPeriod] = useState<ProgressPeriod>("month");
  const [anchor, setAnchor] = useState(() => progressToday());
  const [rangeEnd, setRangeEnd] = useState(() => progressToday());
  const [projectId, setProjectId] = useState(() => projects.find((project) => project.name === initialProjectName)?.id ?? "");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [category, setCategory] = useState("");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [layout, setLayout] = useState<"bundles" | "timeline" | "timeline2x" | "timeline3x" | "orbit">("timeline2x");
  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const today = progressToday();
  const choices = useMemo(() => progressProjects(tasks, projects), [tasks, projects]);
  const categories = projectCategoryNames(choices);
  const currentCategory = categories.includes(category) ? category : "";
  const scope = useMemo(() => filterProjectCategory(tasks, choices, currentCategory), [tasks, choices, currentCategory]);
  const currentProjectId = projectForId(scope.projects, projectId)?.id ?? "";
  const columnDays = layout === "timeline2x" ? 2 : layout === "timeline3x" ? 3 : undefined;
  const data = useMemo(() => buildProjectProgress(scope.tasks, scope.projects, { period, anchor, rangeEnd, projectId: currentProjectId, status, today, columnDays }), [scope, period, anchor, rangeEnd, currentProjectId, status, today, columnDays]);
  const groups = useMemo(() => groupProjectsByCategory(data.rows.map(row => ({ ...row.project, row }))).map(group => {
    const rows = group.projects.map(project => project.row);
    return { name: group.name, rows, ...summarizeProgressRows(rows) };
  }), [data.rows]);
  const periodTitle = period === "year" ? data.start.slice(0, 4) : period === "quarter" ? `Q${Math.floor((Number(data.start.slice(5, 7)) - 1) / 3) + 1} ${data.start.slice(0, 4)}` : period === "month" ? progressDateLabel(data.start, { month: "long", year: "numeric" }) : period === "day" ? progressDateLabel(data.start, { month: "short", day: "numeric", year: "numeric" }) : `${progressDateLabel(data.start)} – ${progressDateLabel(data.end, { month: "short", day: "numeric", year: "numeric" })}`;
  const calendarOffset = (new Date(`${data.start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const calendarWeeks = Math.ceil((calendarOffset + data.days.length) / 7);
  const maxWeekday = Math.max(1, ...data.weekdays.map((day) => day.count));
  const detail = data.completions.filter((item) => !selectedDay || item.date === selectedDay).sort((left, right) => right.date.localeCompare(left.date) || right.task.id - left.task.id);

  function changeScope(action: () => void) { action(); setSelectedDay(null); }

  function movePeriod(step: number) {
    changeScope(() => {
      const next = moveProgressPeriod(anchor, period, step, rangeEnd);
      if (period === "range") {
        const shift = Math.round((Date.parse(next) - Date.parse(anchor)) / 86_400_000);
        setRangeEnd(shiftProgressDay(rangeEnd, shift));
      } else if (next > rangeEnd) setRangeEnd(next);
      setAnchor(next);
    });
  }

  function exportCsv() {
    const rows = [["Task ID", "Task", "Parent category", "Project / Priority", "Completion timestamp", `Completion day (${PROGRESS_TIME_ZONE})`, "Priority"], ...detail.map(({ task, date }) => [task.id, task.title, projectCategory(choices.find(project => project.name === task.project) ?? { name: task.project }), task.project, task.completedAt ?? "", date, task.priority])];
    const csv = rows.map((row) => row.map((value) => {
      const text = String(value);
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    }).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `orbit-project-progress-${selectedDay ?? `${data.start}-to-${data.end}`}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="project-progress-view">
    <section className="progress-controls" aria-label="Progress controls">
      <div className="project-view-switch progress-period-switch" role="group" aria-label="Progress period">{PERIODS.map((item) => <button type="button" key={item.value} className={period === item.value ? "active" : ""} aria-pressed={period === item.value} onClick={() => changeScope(() => setPeriod(item.value))}>{item.label}</button>)}</div>
      <div className="progress-period-navigation"><button className="icon-button" type="button" aria-label="Previous period" onClick={() => movePeriod(-1)}><ChevronLeft size={18} /></button><strong aria-live="polite">{periodTitle}</strong><button className="icon-button" type="button" aria-label="Next period" onClick={() => movePeriod(1)}><ChevronRight size={18} /></button><button className="secondary-button" type="button" onClick={() => changeScope(() => { setAnchor(today); if (rangeEnd < today || period === "range") setRangeEnd(today); })}>Today</button></div>
      <label>{period === "range" ? "Start date" : period === "day" ? "Date" : "Reference date"}<input type="date" aria-label="Progress reference date" value={anchor} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) changeScope(() => { setAnchor(event.target.value); if (event.target.value > rangeEnd) setRangeEnd(event.target.value); }); }} /></label>
      {period === "range" && <label>End date<input type="date" aria-label="Progress end date" min={anchor} value={rangeEnd} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value) && event.target.value >= anchor) changeScope(() => setRangeEnd(event.target.value)); }} /></label>}
      <label>Parent category<select aria-label="Progress parent category" value={currentCategory} onChange={event => changeScope(() => { setCategory(event.target.value); setProjectId(""); })}><option value="">All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Project / Priority<select aria-label="Progress project / priority" value={currentProjectId} onChange={(event) => changeScope(() => setProjectId(event.target.value))}><option value="">All projects / priorities</option>{scope.projects.filter((project) => status === "all" || (status === "disabled" ? project.disabled : !project.disabled)).map((project) => <option key={project.id} value={project.id}>{project.name || "Unassigned"}{project.disabled ? " (disabled)" : ""}</option>)}</select></label>
      <label>Project status<select aria-label="Progress project status" value={status} onChange={(event) => changeScope(() => { setStatus(event.target.value as typeof status); setProjectId(""); })}><option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
    </section>

    <p className="progress-range-note">{progressDateLabel(data.start, { month: "short", day: "numeric", year: "numeric" })} – {progressDateLabel(data.end, { month: "short", day: "numeric", year: "numeric" })} · {PROGRESS_TIME_ZONE} · {data.rows.length} projects / priorities</p>
    <div className="progress-kpis" aria-label="Progress summary">
      <article><span>Completed in period</span><strong>{data.totalCompleted}</strong></article>
      <article><span>Days with completions</span><strong>{data.activeDays}</strong></article>
      <article><span>Projects progressed</span><strong>{data.projectsProgressed}</strong></article>
      <article><span>Open tasks now</span><strong>{data.openTasks}</strong></article>
    </div>

    {data.undatedCompleted > 0 && <p className="progress-data-note" role="status">{data.undatedCompleted} completed task{data.undatedCompleted === 1 ? " has" : "s have"} no valid completion date. They remain in current project totals and are excluded from the timeline.</p>}
    {data.start > today && <p className="progress-data-note">This period is in the future. Future days are shaded and have no recorded activity yet.</p>}

    <div className="progress-chart-grid">
      <section className="progress-panel progress-calendar-panel" aria-labelledby="progress-calendar-title">
        <div className="progress-panel-heading"><div><h2 id="progress-calendar-title">Daily activity</h2><p>Completed tasks each day. Select a day to inspect its tasks.</p></div><TrendingUp size={20} /></div>
        <div className="progress-calendar-scroll" tabIndex={0} role="region" aria-label="Daily completion calendar">
          <div className="progress-calendar-labels" aria-hidden="true">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>
          <div className={`progress-calendar period-${period}`} style={{ gridTemplateColumns: period === "week" ? "repeat(7, 32px)" : `repeat(${calendarWeeks}, ${period === "month" ? 32 : 20}px)` }}>
            {Array.from({ length: calendarWeeks * 7 }, (_, index) => {
              const day = data.days[index - calendarOffset];
              if (!day) return <span className="progress-calendar-gap" key={`gap-${index}`} />;
              const fullDate = progressDateLabel(day.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
              return <button type="button" key={day.date} className={`progress-day activity-${completionLevel(day.count)}${day.future ? " future" : ""}${day.date === today ? " today" : ""}`} disabled={day.future} aria-label={`${fullDate}: ${day.future ? "future day" : `${day.count} completed tasks`}`} title={`${fullDate} · ${day.future ? "Future" : `${day.count} completed`}`} aria-pressed={selectedDay === day.date} onClick={() => setSelectedDay(selectedDay === day.date ? null : day.date)}>{period === "week" || period === "month" ? Number(day.date.slice(8)) : ""}</button>;
            })}
          </div>
        </div>
        <div className="progress-legend" aria-label="Daily completion count legend"><span>Completed tasks</span>{["0", "1", "2–3", "4–6", "7+"].map((label, index) => <span key={label}><i className={`activity-${index}`} />{label}</span>)}<span><i className="future" />Future</span></div>
      </section>

      <section className="progress-panel" aria-labelledby="progress-weekdays-title"><div className="progress-panel-heading"><div><h2 id="progress-weekdays-title">Completions by weekday</h2><p>Totals within the selected period.</p></div></div><ol className="progress-weekdays">{data.weekdays.map((day) => <li key={day.label}><span>{day.label}</span><div><i style={{ width: `${day.count / maxWeekday * 100}%` }} /></div><strong>{day.count}</strong></li>)}</ol></section>
    </div>

    <section className="progress-category-section" aria-labelledby="progress-projects-title">
      <div className="progress-panel-heading"><div><h2 id="progress-projects-title">Progress by parent category</h2><p>{groups.length} category bundles · {data.rows.length} projects / priorities. Each bundle combines its projects’ progress for {periodTitle}. Current completion excludes N/A tasks.</p></div><div className="progress-detail-actions">
        {(currentCategory || currentProjectId) && <button className="secondary-button" type="button" onClick={() => changeScope(() => { setCategory(""); setProjectId(""); })}>All category bundles</button>}
        <div className="project-view-switch progress-layout-switch" role="group" aria-label="Progress layout"><button type="button" className={layout === "bundles" ? "active" : ""} aria-pressed={layout === "bundles"} onClick={() => setLayout("bundles")}><FolderTree size={16} /> Bundles</button><button type="button" className={layout === "timeline" ? "active" : ""} aria-pressed={layout === "timeline"} onClick={() => setLayout("timeline")}><Rows3 size={16} /> Timeline</button><button type="button" className={layout === "timeline2x" ? "active" : ""} aria-pressed={layout === "timeline2x"} onClick={() => setLayout("timeline2x")}><Rows3 size={16} /> 2x Timeline</button><button type="button" className={layout === "timeline3x" ? "active" : ""} aria-pressed={layout === "timeline3x"} onClick={() => setLayout("timeline3x")}><Rows3 size={16} /> 3x Timeline</button><button type="button" className={layout === "orbit" ? "active" : ""} aria-pressed={layout === "orbit"} onClick={() => setLayout("orbit")}><Orbit size={16} /> Circular Orbit</button></div>
      </div></div>
      {groups.length === 0 ? <p className="progress-empty">No projects match these filters.</p> : layout === "orbit" ? <ProjectProgressOrbit categories={groups.map(group => ({ name: group.name, count: group.periodCompleted, projects: group.rows.length, color: BUNDLE_COLORS[categories.indexOf(group.name) % BUNDLE_COLORS.length] }))} periodTitle={periodTitle} onSelectCategory={name => changeScope(() => { setCategory(name); setProjectId(""); })} /> : layout === "bundles" ? <div className="project-category-bundles progress-category-bundles">{groups.map(group => {
        const color = BUNDLE_COLORS[categories.indexOf(group.name) % BUNDLE_COLORS.length];
        const disabled = group.rows.filter(row => row.project.disabled).length;
        return <section className="project-category-bundle progress-category-bundle" key={group.name} aria-label={`${group.name} progress bundle`} style={{ borderTopColor: color }}>
          <header className="category-bundle-heading"><span className="category-bundle-icon" style={{ color, background: `${color}12` }}><FolderTree size={23} /></span><div><h3>{group.name}</h3><p>{group.rows.length} {group.rows.length === 1 ? "project / priority" : "projects / priorities"}{disabled > 0 ? ` · ${disabled} disabled` : ""}</p></div></header>
          <dl className="progress-bundle-totals"><div><dt>Completed in period</dt><dd>{group.periodCompleted}</dd></div><div><dt>Open tasks now</dt><dd>{group.open}</dd></div></dl>
          <div className="category-bundle-summary"><span>Current completion · {group.done} / {group.total}</span><strong>{group.percent === null ? "—" : `${group.percent}%`}</strong></div>
          <div className="category-bundle-meter" aria-label={group.percent === null ? "No applicable tasks" : `${group.percent}% of applicable tasks complete`}><span style={{ width: `${group.percent ?? 0}%`, background: color }} /></div>
          {group.notApplicable > 0 && <p className="progress-bundle-excluded">{group.notApplicable} N/A tasks excluded</p>}
          <div className="progress-bundle-columns" aria-hidden="true"><span>Project / Priority</span><span>In period</span><span>Current</span></div>
          <ul className="category-bundle-projects">{group.rows.map(row => <li className={row.project.disabled ? "bundle-child disabled" : "bundle-child"} key={row.project.id}>
            <button className="bundle-child-open" type="button" onClick={() => changeScope(() => setProjectId(row.project.id))} aria-label={`View ${row.project.name || "Unassigned"} progress: ${row.periodCompleted} completed in period, ${row.percent === null ? "no applicable tasks" : `${row.percent}% current completion`}`}><span className="project-dot" style={{ background: row.project.color }} /><span><strong>{row.project.name || "Unassigned"}</strong><small>{row.project.disabled ? "Disabled · " : ""}{row.open} open tasks</small></span><span className="progress-bundle-child-metrics"><strong>{row.periodCompleted}</strong><span>{row.percent === null ? "—" : `${row.percent}%`}</span></span></button>
          </li>)}</ul>
          <button className="category-bundle-details" type="button" onClick={() => changeScope(() => { setCategory(group.name); setProjectId(""); })} aria-label={`View ${group.name} category activity`}>View category activity <ArrowRight size={15} /></button>
        </section>;
      })}</div> : <div className="progress-panel">
        <p className="progress-timeline-note">{columnDays ? `${columnDays} consecutive days per column, anchored to October 23, 2026.` : `${period === "quarter" ? "Weekly" : period === "year" ? "Monthly" : "Daily"} columns.`} Counts show completed tasks{columnDays ? "; boundary columns count only dates inside the selected period" : ""}. Expand or collapse a parent category to compare its projects.</p>
        <div className="progress-table-scroll" tabIndex={0} role="region" aria-label="Project progress comparison grouped by parent category"><table className={`progress-project-table${columnDays ? " progress-batched-table" : ""}`}><thead><tr><th scope="col">Parent category / Project</th><th scope="col">Completed in period</th><th scope="col">Current completion</th>{data.buckets.map(bucket => <th scope="col" key={bucket.start} title={`${bucket.start} – ${bucket.end}`}>{bucket.label}</th>)}</tr></thead>{groups.map(group => {
          const expanded = !collapsedCategories.includes(group.name);
          const color = BUNDLE_COLORS[categories.indexOf(group.name) % BUNDLE_COLORS.length];
          return <tbody key={group.name} aria-label={`${group.name} progress`}>
            <tr className="progress-category-total"><th scope="row"><button type="button" aria-label={`${expanded ? "Collapse" : "Expand"} ${group.name} projects`} aria-expanded={expanded} onClick={() => setCollapsedCategories(previous => expanded ? [...previous, group.name] : previous.filter(name => name !== group.name))}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<FolderTree size={16} />{group.name}</button><small>{group.rows.length} projects / priorities · {group.open} open tasks</small></th><td><strong>{group.periodCompleted}</strong></td><td><div className="progress-current"><span>{group.done} / {group.total}{group.percent === null ? " · No applicable tasks" : ` · ${group.percent}%`}</span>{group.notApplicable > 0 && <small>{group.notApplicable} N/A excluded</small>}<i><b style={{ width: `${group.percent ?? 0}%`, background: color }} /></i></div></td>{group.counts.map((count, index) => <td key={data.buckets[index].start}><span className={`progress-cell activity-${completionLevel(count)}${data.buckets[index].future ? " future" : ""}`} title={`${group.name} · ${data.buckets[index].start} – ${data.buckets[index].end}: ${count} completed tasks`}>{data.buckets[index].future ? "—" : count}</span></td>)}</tr>
            {expanded && group.rows.map(row => <tr className="progress-project-child" key={row.project.id}>
              <th scope="row"><button type="button" onClick={() => changeScope(() => setProjectId(row.project.id))}><span className="project-dot" style={{ background: row.project.color }} />{row.project.name || "Unassigned"}</button>{row.project.disabled && <small>Disabled</small>}</th>
              <td><strong>{row.periodCompleted}</strong></td><td><div className="progress-current"><span>{row.done} / {row.total}{row.percent === null ? " · No applicable tasks" : ` · ${row.percent}%`}</span>{row.notApplicable > 0 && <small>{row.notApplicable} N/A excluded</small>}<i><b style={{ width: `${row.percent ?? 0}%`, background: row.project.color }} /></i></div></td>
              {row.counts.map((count, index) => <td key={data.buckets[index].start}><button type="button" className={`progress-cell activity-${completionLevel(count)}${data.buckets[index].future ? " future" : ""}`} disabled={data.buckets[index].future} title={`${row.project.name || "Unassigned"} · ${data.buckets[index].start} – ${data.buckets[index].end}: ${count} completed tasks`} aria-label={`${row.project.name || "Unassigned"}, ${data.buckets[index].start} to ${data.buckets[index].end}: ${count} completed tasks; filter to this project`} onClick={() => changeScope(() => setProjectId(row.project.id))}>{data.buckets[index].future ? "—" : count}</button></td>)}
            </tr>)}
          </tbody>;
        })}</table></div>
      </div>}
    </section>

    <section className="progress-panel" aria-labelledby="progress-detail-title"><div className="progress-panel-heading"><div><h2 id="progress-detail-title">Completed tasks{selectedDay ? ` · ${progressDateLabel(selectedDay)}` : " in period"}</h2><p>{detail.length} recorded completions · select a task to open it.</p></div><div className="progress-detail-actions">{selectedDay && <button className="secondary-button" type="button" onClick={() => setSelectedDay(null)}>Show entire period</button>}<button className="secondary-button" type="button" onClick={exportCsv} disabled={detail.length === 0}><Download size={15} /> Export CSV</button></div></div>
      {detail.length ? <div className="progress-table-scroll"><table className="progress-detail-table"><thead><tr><th scope="col">Task</th><th scope="col">Project / Priority</th><th scope="col">Completed</th><th scope="col">Priority</th></tr></thead><tbody>{detail.map(({ task, date }) => <tr key={task.id}><td><button type="button" onClick={() => onEditTask(task)}>{task.title}</button></td><td>{task.project || "Unassigned"}</td><td><time dateTime={date}>{progressDateLabel(date, { month: "short", day: "numeric", year: "numeric" })}</time></td><td>{task.priority}</td></tr>)}</tbody></table></div> : <p className="progress-empty">No dated task completions in this selection. Complete a task to record progress, or choose another period.</p>}
    </section>
    <details className="progress-methods"><summary>How progress is calculated</summary><p>Source: your synced Orbit workspace. Each currently completed task counts once on its recorded completion date in {PROGRESS_TIME_ZONE}. Tasks without valid dates are excluded from time charts. N/A tasks are excluded from completions, open tasks, and completion percentages. Open tasks and current completion use the present task list, regardless of the selected historical period.</p><p>Parent categories use the same assignments as Projects / Priorities. Category counts sum their visible child projects; current completion divides their combined completed tasks by combined applicable tasks, rather than averaging project percentages. All category bundles and timeline totals follow the selected period, category, project and status filters.</p><p>These are retained task records, not historical workspace snapshots. Reopening or deleting tasks changes the totals; merged tasks are grouped under their destination project. Selecting a calendar day filters only the completed-task detail and its export.</p><p>Calendar colors represent daily counts. Comparison cells use the same count bands for the daily, multi-day, weekly, or monthly column shown; numbers provide exact counts. No activity targets or due-date success rates are inferred.</p></details>
  </div>;
}
