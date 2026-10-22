"use client";

import { ChevronLeft, ChevronRight, Download, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { buildProjectProgress, completionLevel, moveProgressPeriod, progressDateLabel, progressProjects, progressToday, PROGRESS_TIME_ZONE, WEEKDAY_NAMES, type ProgressPeriod } from "@/lib/project-progress";
import { projectForId, type Project } from "@/lib/projects";
import type { Task } from "./page";

const PERIODS: { value: ProgressPeriod; label: string }[] = [{ value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Year" }];

export function ProjectProgressView({ tasks, projects, initialProjectName, onEditTask }: { tasks: Task[]; projects: Project[]; initialProjectName?: string | null; onEditTask: (task: Task) => void }) {
  const [period, setPeriod] = useState<ProgressPeriod>("month");
  const [anchor, setAnchor] = useState(() => progressToday());
  const [projectId, setProjectId] = useState(() => projects.find((project) => project.name === initialProjectName)?.id ?? "");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const today = progressToday();
  const choices = useMemo(() => progressProjects(tasks, projects), [tasks, projects]);
  const currentProjectId = projectForId(choices, projectId)?.id ?? "";
  const data = useMemo(() => buildProjectProgress(tasks, projects, { period, anchor, projectId: currentProjectId, status, today }), [tasks, projects, period, anchor, currentProjectId, status, today]);
  const periodTitle = period === "year" ? data.start.slice(0, 4) : period === "quarter" ? `Q${Math.floor((Number(data.start.slice(5, 7)) - 1) / 3) + 1} ${data.start.slice(0, 4)}` : period === "month" ? progressDateLabel(data.start, { month: "long", year: "numeric" }) : `${progressDateLabel(data.start)} – ${progressDateLabel(data.end, { month: "short", day: "numeric", year: "numeric" })}`;
  const calendarOffset = (new Date(`${data.start}T00:00:00Z`).getUTCDay() + 6) % 7;
  const calendarWeeks = Math.ceil((calendarOffset + data.days.length) / 7);
  const maxWeekday = Math.max(1, ...data.weekdays.map((day) => day.count));
  const detail = data.completions.filter((item) => !selectedDay || item.date === selectedDay).sort((left, right) => right.date.localeCompare(left.date) || right.task.id - left.task.id);

  function changeScope(action: () => void) { action(); setSelectedDay(null); }

  function exportCsv() {
    const rows = [["Task ID", "Task", "Project / Priority", "Completion timestamp", `Completion day (${PROGRESS_TIME_ZONE})`, "Priority"], ...detail.map(({ task, date }) => [task.id, task.title, task.project, task.completedAt ?? "", date, task.priority])];
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
      <div className="project-view-switch" role="group" aria-label="Progress period">{PERIODS.map((item) => <button type="button" key={item.value} className={period === item.value ? "active" : ""} aria-pressed={period === item.value} onClick={() => changeScope(() => setPeriod(item.value))}>{item.label}</button>)}</div>
      <div className="progress-period-navigation"><button className="icon-button" type="button" aria-label="Previous period" onClick={() => changeScope(() => setAnchor(moveProgressPeriod(anchor, period, -1)))}><ChevronLeft size={18} /></button><strong aria-live="polite">{periodTitle}</strong><button className="icon-button" type="button" aria-label="Next period" onClick={() => changeScope(() => setAnchor(moveProgressPeriod(anchor, period, 1)))}><ChevronRight size={18} /></button><button className="secondary-button" type="button" onClick={() => changeScope(() => setAnchor(today))}>Today</button></div>
      <label>Reference date<input type="date" aria-label="Progress reference date" value={anchor} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) changeScope(() => setAnchor(event.target.value)); }} /></label>
      <label>Project / Priority<select aria-label="Progress project / priority" value={currentProjectId} onChange={(event) => changeScope(() => setProjectId(event.target.value))}><option value="">All projects / priorities</option>{choices.filter((project) => status === "all" || (status === "disabled" ? project.disabled : !project.disabled)).map((project) => <option key={project.id} value={project.id}>{project.name || "Unassigned"}{project.disabled ? " (disabled)" : ""}</option>)}</select></label>
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

    <section className="progress-panel" aria-labelledby="progress-projects-title">
      <div className="progress-panel-heading"><div><h2 id="progress-projects-title">Progress by project / priority</h2><p>{period === "quarter" ? "Weekly columns" : period === "year" ? "Monthly columns" : "Daily columns"} show completed tasks. Current completion is all completed tasks ÷ all current tasks.</p></div></div>
      <div className="progress-table-scroll" tabIndex={0} role="region" aria-label="Project progress comparison"><table className="progress-project-table"><thead><tr><th scope="col">Project / Priority</th><th scope="col">Completed in period</th><th scope="col">Current completion</th>{data.buckets.map((bucket) => <th scope="col" key={bucket.start} title={`${bucket.start} – ${bucket.end}`}>{bucket.label}</th>)}</tr></thead><tbody>{data.rows.map((row) => <tr key={row.project.id}>
        <th scope="row"><button type="button" onClick={() => changeScope(() => setProjectId(row.project.id))}><span className="project-dot" style={{ background: row.project.color }} />{row.project.name || "Unassigned"}</button>{row.project.disabled && <small>Disabled</small>}</th>
        <td><strong>{row.periodCompleted}</strong></td><td><div className="progress-current"><span>{row.done} / {row.total}{row.percent === null ? " · No tasks" : ` · ${row.percent}%`}</span><i><b style={{ width: `${row.percent ?? 0}%`, background: row.project.color }} /></i></div></td>
        {row.counts.map((count, index) => <td key={data.buckets[index].start}><button type="button" className={`progress-cell activity-${completionLevel(count)}${data.buckets[index].start > today ? " future" : ""}`} disabled={data.buckets[index].start > today} title={`${row.project.name || "Unassigned"} · ${data.buckets[index].start} – ${data.buckets[index].end}: ${count} completed tasks`} aria-label={`${row.project.name || "Unassigned"}, ${data.buckets[index].start} to ${data.buckets[index].end}: ${count} completed tasks; filter to this project`} onClick={() => changeScope(() => setProjectId(row.project.id))}>{data.buckets[index].start > today ? "—" : count}</button></td>)}
      </tr>)}</tbody></table>{data.rows.length === 0 && <p className="progress-empty">No projects match these filters.</p>}</div>
    </section>

    <section className="progress-panel" aria-labelledby="progress-detail-title"><div className="progress-panel-heading"><div><h2 id="progress-detail-title">Completed tasks{selectedDay ? ` · ${progressDateLabel(selectedDay)}` : " in period"}</h2><p>{detail.length} recorded completions · select a task to open it.</p></div><div className="progress-detail-actions">{selectedDay && <button className="secondary-button" type="button" onClick={() => setSelectedDay(null)}>Show entire period</button>}<button className="secondary-button" type="button" onClick={exportCsv} disabled={detail.length === 0}><Download size={15} /> Export CSV</button></div></div>
      {detail.length ? <div className="progress-table-scroll"><table className="progress-detail-table"><thead><tr><th scope="col">Task</th><th scope="col">Project / Priority</th><th scope="col">Completed</th><th scope="col">Priority</th></tr></thead><tbody>{detail.map(({ task, date }) => <tr key={task.id}><td><button type="button" onClick={() => onEditTask(task)}>{task.title}</button></td><td>{task.project || "Unassigned"}</td><td><time dateTime={date}>{progressDateLabel(date, { month: "short", day: "numeric", year: "numeric" })}</time></td><td>{task.priority}</td></tr>)}</tbody></table></div> : <p className="progress-empty">No dated task completions in this selection. Complete a task to record progress, or choose another period.</p>}
    </section>
    <details className="progress-methods"><summary>How progress is calculated</summary><p>Source: your synced Orbit workspace. Each currently completed task counts once on its recorded completion date in {PROGRESS_TIME_ZONE}. Tasks without valid dates are excluded from time charts. Open tasks and current completion use the present task list, regardless of the selected historical period.</p><p>These are retained task records, not historical workspace snapshots. Reopening or deleting tasks changes the totals; merged tasks are grouped under their destination project. Selecting a calendar day filters only the completed-task detail and its export.</p><p>Calendar colors represent daily counts. Comparison cells use the same count bands for the daily, weekly, or monthly column shown; numbers provide exact counts. No activity targets or due-date success rates are inferred.</p></details>
  </div>;
}
