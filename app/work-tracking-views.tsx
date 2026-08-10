"use client";

import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, FileDown, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import {
  REQUIRED_WEEKLY_HOURS,
  WEEKDAY_LABELS,
  actualHoursForWeek,
  addDays,
  buildTimesheetRows,
  eligibleActualHoursForWeek,
  entriesForWorkweek,
  formatHours,
  formatReportingPeriod,
  formatShortDate,
  formatWeekRange,
  hoursBetween,
  isInnovationWorkItem,
  maximumPlanningDate,
  plannedHoursForWeek,
  publicHolidayNamesForWorkItemWeek,
  reportingWeeks,
  sprintForDate,
  timesheetOverrideKey,
  todayIsoDate,
  utilizedHoursForWeek,
  weekdayDates,
  weekStartFromDate,
  workItemActualHoursForWeek,
  workItemDisplayTitleForWeek,
  type ActualEntry,
  type Frequency,
  type ReportingPeriodMode,
  type SprintDefinition,
  type TaskType,
  type WorkItem,
  type WorkOptionGroup,
  type WorkTrackingState,
  type Workstream,
} from "@/lib/work-tracking";
import { exportWorkTrackingWorkbooks } from "@/lib/workbook-export";

type OrbitTaskOption = { id: number; title: string; project: string; notes: string };
type TrackingViewProps = {
  state: WorkTrackingState;
  onChange: Dispatch<SetStateAction<WorkTrackingState>>;
  orbitTasks: OrbitTaskOption[];
  personName: string;
};

type SelectionManagerViewProps = TrackingViewProps & {
  canEdit: boolean;
  editorUsername: string;
};

const NEW_TASK = "__new-task";
const NEW_UTILIZED_TASK = "__new-utilized-task";

function newId(prefix: string) {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function endTimeForHours(startTime: string, hours: number) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  if (!Number.isFinite(startHour) || !Number.isFinite(startMinute)) return startTime;
  const totalMinutes = Math.min(24 * 60 - 1, Math.max(0, (startHour * 60) + startMinute + Math.round(hours * 60)));
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

const PLANNING_MAX_DATE = maximumPlanningDate();
const PLANNING_MAX_WEEK = weekStartFromDate(PLANNING_MAX_DATE);

function availableReportingWeeks(anchor: string, mode: ReportingPeriodMode, sprints: SprintDefinition[]) {
  return reportingWeeks(anchor, mode, sprints).filter((week) => week <= PLANNING_MAX_WEEK);
}

function HoursRule({ total, target = REQUIRED_WEEKLY_HOURS, exact = false, label }: { total: number; target?: number; exact?: boolean; label: string }) {
  const valid = exact ? Math.abs(total - target) < 0.001 : total >= target;
  const remaining = Math.max(0, target - total);
  return (
    <div className={`work-rule ${valid ? "valid" : "warning"}`} role="status">
      {valid ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
      <div><strong>{formatHours(total)}h</strong><span>{valid ? label : `${formatHours(remaining)}h still required`}</span></div>
    </div>
  );
}

function PeriodViewControl({ mode, anchor, sprints, onModeChange, onAnchorChange, onApply }: { mode: ReportingPeriodMode; anchor: string; sprints: SprintDefinition[]; onModeChange: (mode: ReportingPeriodMode) => void; onAnchorChange: (anchor: string) => void; onApply?: () => void }) {
  const activeSprint = sprintForDate(sprints, anchor);

  function changeMode(nextMode: ReportingPeriodMode) {
    onModeChange(nextMode);
    if (nextMode === "sprint" && !activeSprint && sprints[0]) onAnchorChange(sprints[0].startDate);
  }

  return (
    <div className="period-view-control">
      <label><span>View</span><select value={mode} onChange={(event) => changeMode(event.target.value as ReportingPeriodMode)}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="sprint">Every sprint</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
      {mode === "sprint" ? <label><span>Sprint</span><select value={activeSprint?.id ?? ""} disabled={!sprints.length} onChange={(event) => { const sprint = sprints.find((item) => item.id === event.target.value); if (sprint) onAnchorChange(sprint.startDate); }}><option value="">{sprints.length ? "Select sprint" : "Configure sprints first"}</option>{sprints.map((sprint) => <option key={sprint.id} value={sprint.id}>{sprint.name} · {formatShortDate(sprint.startDate)}–{formatShortDate(sprint.endDate)}</option>)}</select></label> : <label><span>Anchor date</span><input type="date" max={PLANNING_MAX_DATE} value={anchor} onChange={(event) => onAnchorChange(event.target.value)} /></label>}
      {onApply && <button className="secondary-button" type="button" onClick={onApply}>Apply {mode} view</button>}
      <small>{mode === "sprint" ? "Sprint dates are managed in Selection Manager" : `All past weeks · up to ${formatShortDate(PLANNING_MAX_DATE)} next year`}</small>
    </div>
  );
}

function ExportButtons({ onExportWeek, onExportSelected, selectedCount, weekDisabled = false }: { onExportWeek: () => Promise<void>; onExportSelected: () => Promise<void>; selectedCount: number; weekDisabled?: boolean }) {
  return (
    <div className="work-export-actions">
      <button className="secondary-button" type="button" onClick={() => void onExportSelected()}><FileDown size={16} /> Export selected weeks ({selectedCount})</button>
      <button className="primary-button" type="button" onClick={() => void onExportWeek()} disabled={weekDisabled} title={weekDisabled ? "Complete the 45-hour Timesheet requirement before exporting this week" : undefined}><Download size={16} /> Export this week</button>
    </div>
  );
}

const DEFAULT_ITEM_DRAFT = {
  title: "",
  taskType: "Test" as TaskType,
  workstream: "Legal" as Workstream,
  application: "",
  phase: "Planning",
  frequency: "Recurring" as Frequency,
  notes: "",
};

const OPTION_GROUPS: { key: WorkOptionGroup; label: string; description: string }[] = [
  { key: "workstreams", label: "Workstreams", description: "Business areas used in Actuals, Effort Plan, Timesheet Report, and Dashboard." },
  { key: "taskTypes", label: "Task types", description: "High-level work classifications, including meeting and test work." },
  { key: "phases", label: "Phases / subcategories", description: "Planning, execution, reporting, and other task phases." },
  { key: "applications", label: "Applications", description: "Applications or products that tasks are recorded against." },
  { key: "frequencies", label: "Frequencies", description: "Recurring and one-time delivery patterns for planned work." },
  { key: "leaveTypes", label: "Leave & holiday types", description: "Advance absence options available from Timesheet Report." },
];

const PROTECTED_OPTIONS: Record<WorkOptionGroup, Set<string>> = {
  workstreams: new Set(["Legal", "Ethics and Compliance", "Real Estate", "Audit and Risk", "Corporate Communications", "Innovation"]),
  taskTypes: new Set(["Test", "Meeting - Internal", "Meeting - Client", "PTO", "Innovation"]),
  phases: new Set(["Planning", "Execution", "Leave", "Holiday"]),
  applications: new Set(),
  frequencies: new Set(["Recurring"]),
  leaveTypes: new Set(["Public Holiday"]),
};

export function ActualsView({ state, onChange, orbitTasks, personName }: TrackingViewProps) {
  const [week, setWeek] = useState(() => weekStartFromDate(todayIsoDate()));
  const [periodMode, setPeriodMode] = useState<ReportingPeriodMode>("weekly");
  const [taskChoice, setTaskChoice] = useState(state.workItems.find((item) => item.taskType !== "PTO")?.id ?? NEW_TASK);
  const [date, setDate] = useState(todayIsoDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [details, setDetails] = useState("");
  const [testCaseCount, setTestCaseCount] = useState(0);
  const [bugCount, setBugCount] = useState(0);
  const [itemDraft, setItemDraft] = useState(DEFAULT_ITEM_DRAFT);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryDraft, setEntryDraft] = useState<Pick<ActualEntry, "date" | "startTime" | "endTime" | "testCaseCount" | "bugCount">>({ date: "", startTime: "", endTime: "", testCaseCount: 0, bugCount: 0 });
  const [message, setMessage] = useState("");
  const periodWeeks = availableReportingWeeks(week, periodMode, state.sprints);
  const dates = weekdayDates(weekStartFromDate(week));
  const detailEntries = entriesForWorkweek(state, week);
  const weekEntries = periodWeeks.flatMap((periodWeek) => entriesForWorkweek(state, periodWeek));
  const weekTotal = periodWeeks.reduce((total, periodWeek) => total + actualHoursForWeek(state, periodWeek), 0);

  const rows = useMemo(() => state.workItems.map((item) => {
    const daily = dates.map((day) => detailEntries
      .filter((entry) => entry.workItemId === item.id && entry.date === day)
      .reduce((totals, entry) => ({ hours: totals.hours + hoursBetween(entry.startTime, entry.endTime), testCases: totals.testCases + entry.testCaseCount, bugs: totals.bugs + entry.bugCount }), { hours: 0, testCases: 0, bugs: 0 }));
    return { item, daily, total: daily.reduce((sum, value) => sum + value.hours, 0) };
  }).filter((row) => row.total > 0), [dates, state.workItems, detailEntries]);

  function chooseTask(value: string) {
    setTaskChoice(value);
    setMessage("");
    if (value.startsWith("orbit:")) {
      const task = orbitTasks.find((item) => item.id === Number(value.slice(6)));
      if (task) setItemDraft({ ...DEFAULT_ITEM_DRAFT, title: task.title, application: task.project, notes: task.notes });
    } else if (value === NEW_TASK) {
      setItemDraft(DEFAULT_ITEM_DRAFT);
    }
  }

  function addActual(event: FormEvent) {
    event.preventDefault();
    const hours = hoursBetween(startTime, endTime);
    if (date > PLANNING_MAX_DATE) {
      setMessage(`Dates are available through ${PLANNING_MAX_DATE}.`);
      return;
    }
    if (!hours) {
      setMessage("End time must be later than start time.");
      return;
    }
    let workItemId = taskChoice;
    let newItem: WorkItem | null = null;
    if (taskChoice === NEW_TASK || taskChoice.startsWith("orbit:")) {
      if (!itemDraft.title.trim()) {
        setMessage("Add a task name.");
        return;
      }
      workItemId = newId("work");
      newItem = {
        id: workItemId,
        orbitTaskId: taskChoice.startsWith("orbit:") ? Number(taskChoice.slice(6)) : undefined,
        ...itemDraft,
        title: itemDraft.title.trim(),
        application: itemDraft.application.trim(),
        phase: itemDraft.phase.trim(),
        notes: itemDraft.notes.trim(),
        plannedHoursByWeek: {},
      };
    }
    const entry: ActualEntry = { id: newId("actual"), date, startTime, endTime, workItemId, details: details.trim(), testCaseCount: Math.max(0, Math.floor(testCaseCount)), bugCount: Math.max(0, Math.floor(bugCount)), entrySource: "actual" };
    onChange((current) => ({
      ...current,
      workItems: newItem ? [...current.workItems, newItem] : current.workItems,
      actualEntries: [entry, ...current.actualEntries],
    }));
    setTaskChoice(workItemId);
    setDetails("");
    setTestCaseCount(0);
    setBugCount(0);
    setWeek(weekStartFromDate(date));
    setMessage(`${formatHours(hours)}h added to Actuals.`);
  }

  function removeEntry(id: string) {
    onChange((current) => {
      const entry = current.actualEntries.find((candidate) => candidate.id === id);
      const hours = entry ? hoursBetween(entry.startTime, entry.endTime) : 0;
      const entryWeek = entry ? weekStartFromDate(entry.date) : "";
      return {
        ...current,
        actualEntries: current.actualEntries.filter((candidate) => candidate.id !== id),
        workItems: entry?.entrySource === "scheduled-advance" || entry?.entrySource === "timesheet-source"
          ? current.workItems.map((item) => item.id === entry.workItemId ? { ...item, plannedHoursByWeek: { ...item.plannedHoursByWeek, [entryWeek]: Math.max(0, (item.plannedHoursByWeek[entryWeek] ?? 0) - hours) } } : item)
          : current.workItems,
      };
    });
  }

  function beginEntryEdit(entry: ActualEntry) {
    setEditingEntryId(entry.id);
    setEntryDraft({ date: entry.date, startTime: entry.startTime, endTime: entry.endTime, testCaseCount: entry.testCaseCount, bugCount: entry.bugCount });
    setMessage("");
  }

  function saveEntryEdit(entry: ActualEntry) {
    if (!entryDraft.date || entryDraft.date > PLANNING_MAX_DATE) {
      setMessage(`Choose a date through ${PLANNING_MAX_DATE}.`);
      return;
    }
    const hours = hoursBetween(entryDraft.startTime, entryDraft.endTime);
    if (!hours) {
      setMessage("End time must be later than start time.");
      return;
    }
    const previousHours = hoursBetween(entry.startTime, entry.endTime);
    const previousWeek = weekStartFromDate(entry.date);
    const nextWeek = weekStartFromDate(entryDraft.date);
    onChange((current) => ({
      ...current,
      actualEntries: current.actualEntries.map((candidate) => candidate.id === entry.id ? {
        ...candidate,
        date: entryDraft.date,
        startTime: entryDraft.startTime,
        endTime: entryDraft.endTime,
        testCaseCount: Math.max(0, Math.floor(entryDraft.testCaseCount)),
        bugCount: Math.max(0, Math.floor(entryDraft.bugCount)),
      } : candidate),
      workItems: entry.entrySource === "scheduled-advance" || entry.entrySource === "timesheet-source"
        ? current.workItems.map((item) => item.id === entry.workItemId ? {
          ...item,
          plannedHoursByWeek: {
            ...item.plannedHoursByWeek,
            [previousWeek]: Math.max(0, (item.plannedHoursByWeek[previousWeek] ?? 0) - previousHours + (previousWeek === nextWeek ? hours : 0)),
            ...(previousWeek === nextWeek ? {} : { [nextWeek]: (item.plannedHoursByWeek[nextWeek] ?? 0) + hours }),
          },
        } : item)
        : current.workItems,
    }));
    setEditingEntryId(null);
    setWeek(nextWeek);
    setMessage("Actual date, hours, test cases, and bugs updated across all connected reports.");
  }

  const exportWeek = () => exportWorkTrackingWorkbooks({ state, weeks: [week], personName });
  const exportSelected = () => exportWorkTrackingWorkbooks({ state, weeks: periodWeeks, personName });

  return (
    <div className="view-stack work-view actuals-view">
      <div className="work-toolbar">
        <label className="work-week-control"><span>Workweek</span><input type="date" max={PLANNING_MAX_DATE} value={week} onChange={(event) => setWeek(weekStartFromDate(event.target.value))} /></label>
        <span className="work-range-label">{formatReportingPeriod(week, periodMode, undefined, state.sprints)}</span>
        <ExportButtons onExportWeek={exportWeek} onExportSelected={exportSelected} selectedCount={periodWeeks.length} />
      </div>

      <PeriodViewControl mode={periodMode} anchor={week} sprints={state.sprints} onModeChange={setPeriodMode} onAnchorChange={(value) => setWeek(weekStartFromDate(value))} />

      <div className="work-summary-grid">
        <HoursRule total={weekTotal} target={REQUIRED_WEEKLY_HOURS * periodWeeks.length} label={`${periodMode} Actuals target met`} />
        <div className="work-stat"><span>Entries</span><strong>{weekEntries.length}</strong><small>Monday–Sunday, including optional weekend work</small></div>
        <div className="work-stat"><span>Weeks in view</span><strong>{periodWeeks.length}</strong><small>{periodWeeks.filter((periodWeek) => actualHoursForWeek(state, periodWeek) >= REQUIRED_WEEKLY_HOURS).length} meet the 45h minimum</small></div>
      </div>

      {periodWeeks.length > 1 && <div className="work-panel period-summary-panel"><div className="work-panel-heading"><div><p className="eyebrow">Period overview</p><h2>{formatReportingPeriod(week, periodMode, undefined, state.sprints)}</h2></div><span>45 hours required per workweek</span></div><div className="work-table-scroll"><table className="work-table period-summary-table"><thead><tr><th>Workweek</th><th>Actual hours</th><th>Status</th><th>Entries</th><th>Test cases</th><th>Bugs</th><th>Detail</th></tr></thead><tbody>{periodWeeks.map((periodWeek) => {
        const entries = entriesForWorkweek(state, periodWeek);
        const total = actualHoursForWeek(state, periodWeek);
        return <tr key={periodWeek}><td><strong>{formatWeekRange(periodWeek)}</strong></td><td>{formatHours(total)}h</td><td><small className={total >= REQUIRED_WEEKLY_HOURS ? "metric-pass" : "metric-gap"}>{total >= REQUIRED_WEEKLY_HOURS ? "Complete" : `${formatHours(REQUIRED_WEEKLY_HOURS - total)}h short`}</small></td><td>{entries.length}</td><td>{entries.reduce((sum, entry) => sum + entry.testCaseCount, 0)}</td><td>{entries.reduce((sum, entry) => sum + entry.bugCount, 0)}</td><td><button className="use-actual-button" type="button" onClick={() => setWeek(periodWeek)}>Open week</button></td></tr>;
      })}</tbody></table></div></div>}

      <div className="work-panel actual-entry-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Record your work</p><h2>Add actual time</h2></div><span>Actuals flow into Effort Plan automatically</span></div>
        <form className="actual-entry-form" onSubmit={addActual}>
          <label className="field-label">Date<input type="date" max={PLANNING_MAX_DATE} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className="field-label">Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required /></label>
          <label className="field-label">End time<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required /></label>
          <label className="field-label actual-task-choice">Task<select value={taskChoice} onChange={(event) => chooseTask(event.target.value)}>
            <optgroup label="Reporting tasks">{state.workItems.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.workstream}</option>)}</optgroup>
            <optgroup label="Orbit tasks">{orbitTasks.filter((task) => !state.workItems.some((item) => item.orbitTaskId === task.id)).map((task) => <option key={task.id} value={`orbit:${task.id}`}>{task.title} · {task.project}</option>)}</optgroup>
            <option value={NEW_TASK}>+ Add new task</option>
          </select></label>
          <label className="field-label actual-details">Entry details<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={2} placeholder="What was completed during this time?" /></label>
          <label className="field-label">Test cases worked on<input type="number" min="0" step="1" value={testCaseCount} onChange={(event) => setTestCaseCount(Math.max(0, Number(event.target.value)))} /></label>
          <label className="field-label">Bugs worked on<input type="number" min="0" step="1" value={bugCount} onChange={(event) => setBugCount(Math.max(0, Number(event.target.value)))} /></label>

          {(taskChoice === NEW_TASK || taskChoice.startsWith("orbit:")) && (
            <fieldset className="new-work-item-fields">
              <legend>{taskChoice === NEW_TASK ? "New task details" : "Classify this Orbit task"}</legend>
              <label className="field-label">Task name<input value={itemDraft.title} onChange={(event) => setItemDraft({ ...itemDraft, title: event.target.value })} required /></label>
              <label className="field-label">Task type<select value={itemDraft.taskType} onChange={(event) => setItemDraft({ ...itemDraft, taskType: event.target.value as TaskType })}>{state.options.taskTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field-label">Workstream<select value={itemDraft.workstream} onChange={(event) => setItemDraft({ ...itemDraft, workstream: event.target.value as Workstream })}>{state.options.workstreams.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field-label">Application<select value={itemDraft.application} onChange={(event) => setItemDraft({ ...itemDraft, application: event.target.value })}><option value="">Select application</option>{state.options.applications.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field-label">Phase / subcategory<select value={itemDraft.phase} onChange={(event) => setItemDraft({ ...itemDraft, phase: event.target.value })}>{state.options.phases.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field-label">Frequency<select value={itemDraft.frequency} onChange={(event) => setItemDraft({ ...itemDraft, frequency: event.target.value as Frequency })}>{state.options.frequencies.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="field-label task-detail-field">Task details<textarea value={itemDraft.notes} onChange={(event) => setItemDraft({ ...itemDraft, notes: event.target.value })} rows={2} placeholder="Purpose, deliverables, and additional context" /></label>
            </fieldset>
          )}
          <div className="actual-submit-row"><span className={message.includes("must") || message.includes("Add a") ? "form-message error" : "form-message"}>{message}</span><button className="primary-button" type="submit"><Plus size={16} /> Add {formatHours(hoursBetween(startTime, endTime))}h actual</button></div>
        </form>
      </div>

      <div className="work-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Detailed workweek</p><h2>Hours by task and weekday</h2></div><span>{formatWeekRange(week)}</span></div>
        <div className="work-table-scroll">
          <table className="work-table actuals-matrix">
            <thead><tr><th rowSpan={2}>Task type</th><th rowSpan={2}>Workstream</th><th rowSpan={2}>Subcategory</th><th rowSpan={2}>Task</th>{dates.map((day, index) => <th key={day} colSpan={3} className="actual-day-group">{WEEKDAY_LABELS[index]}<small>{formatShortDate(day)}</small></th>)}<th rowSpan={2}>Total hours</th></tr><tr className="actual-metric-headings">{dates.flatMap((day) => [<th key={`${day}-hours`}>Hours</th>, <th key={`${day}-tests`}>Test cases</th>, <th key={`${day}-bugs`}>Bugs</th>])}</tr></thead>
            <tbody>{rows.length ? rows.map((row) => <tr key={row.item.id}><td>{row.item.taskType}</td><td><span className={`workstream-pill ${isInnovationWorkItem(row.item) ? "innovation" : ""}`}>{row.item.workstream}</span></td><td>{row.item.phase || "—"}</td><td><strong>{workItemDisplayTitleForWeek(state, row.item, week)}</strong><small>{row.item.application || "No application"}</small></td>{row.daily.flatMap((metrics, index) => [<td key={`${dates[index]}-hours`}>{metrics.hours ? formatHours(metrics.hours) : "—"}</td>, <td key={`${dates[index]}-tests`}>{metrics.testCases || "—"}</td>, <td key={`${dates[index]}-bugs`}>{metrics.bugs || "—"}</td>])}<td><strong>{formatHours(row.total)}h</strong></td></tr>) : <tr><td colSpan={5 + (dates.length * 3)} className="work-empty">No Actuals recorded for this workweek.</td></tr>}</tbody>
          </table>
        </div>
      </div>

      <div className="work-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Entry detail</p><h2>{formatReportingPeriod(week, periodMode, undefined, state.sprints)}</h2></div><span>{weekEntries.length} entries</span></div>
        <div className="actual-entry-list">{weekEntries.length ? weekEntries.map((entry) => {
          const item = state.workItems.find((candidate) => candidate.id === entry.workItemId);
          const isEditing = editingEntryId === entry.id;
          return <article key={entry.id} className={isEditing ? "editing" : ""}><div><strong>{item?.title ?? "Unknown task"}{entry.holidayName ? ` — ${entry.holidayName}` : ""}{entry.entrySource === "scheduled-advance" && <em className="advance-entry-badge">Scheduled in advance</em>}{entry.entrySource === "timesheet-source" && <em className="advance-entry-badge utilized">Entered from Timesheet</em>}</strong>{isEditing ? <div className="actual-entry-edit-grid"><label>Date<input type="date" max={PLANNING_MAX_DATE} value={entryDraft.date} onChange={(event) => setEntryDraft({ ...entryDraft, date: event.target.value })} /></label><label>Start time<input type="time" value={entryDraft.startTime} onChange={(event) => setEntryDraft({ ...entryDraft, startTime: event.target.value })} /></label><label>End time<input type="time" value={entryDraft.endTime} onChange={(event) => setEntryDraft({ ...entryDraft, endTime: event.target.value })} /></label><label>Actual hours<input type="number" min="0.25" max="23.75" step="0.25" value={formatHours(hoursBetween(entryDraft.startTime, entryDraft.endTime))} onChange={(event) => setEntryDraft({ ...entryDraft, endTime: endTimeForHours(entryDraft.startTime, Number(event.target.value)) })} /></label><label>Test cases<input type="number" min="0" step="1" value={entryDraft.testCaseCount} onChange={(event) => setEntryDraft({ ...entryDraft, testCaseCount: Math.max(0, Number(event.target.value)) })} /></label><label>Bugs<input type="number" min="0" step="1" value={entryDraft.bugCount} onChange={(event) => setEntryDraft({ ...entryDraft, bugCount: Math.max(0, Number(event.target.value)) })} /></label></div> : <span>{entry.date} · {entry.startTime}–{entry.endTime} · {formatHours(hoursBetween(entry.startTime, entry.endTime))}h · {entry.testCaseCount} test cases · {entry.bugCount} bugs</span>}<p>{entry.details || item?.notes || "No additional details"}</p></div><div className="actual-entry-actions">{isEditing ? <><button type="button" onClick={() => setEditingEntryId(null)} aria-label="Cancel editing"><X size={16} /></button><button className="save" type="button" onClick={() => saveEntryEdit(entry)}>Save</button></> : <button type="button" onClick={() => beginEntryEdit(entry)} aria-label={`Edit ${entry.holidayName || item?.title || "entry"}`}><Pencil size={16} /></button>}<button type="button" onClick={() => removeEntry(entry.id)} aria-label={`Delete ${entry.holidayName || item?.title || "entry"}`}><Trash2 size={16} /></button></div></article>;
        }) : <p className="work-empty">Add your first entry above.</p>}</div>
      </div>
    </div>
  );
}

export function EffortPlanView({ state, onChange, personName }: TrackingViewProps) {
  const [weekInput, setWeekInput] = useState(state.selectedEffortWeeks[0] ?? weekStartFromDate(todayIsoDate()));
  const [periodMode, setPeriodMode] = useState<ReportingPeriodMode>("weekly");

  function updateItem(id: string, patch: Partial<WorkItem>) {
    onChange((current) => ({ ...current, workItems: current.workItems.map((item) => item.id === id ? { ...item, ...patch } : item) }));
  }

  function updatePlannedHours(id: string, week: string, hours: number) {
    onChange((current) => ({ ...current, workItems: current.workItems.map((item) => item.id === id ? { ...item, plannedHoursByWeek: { ...item.plannedHoursByWeek, [week]: Math.max(0, Number.isFinite(hours) ? hours : 0) } } : item) }));
  }

  function addWeek() {
    const week = weekStartFromDate(weekInput);
    onChange((current) => ({ ...current, selectedEffortWeeks: Array.from(new Set([...current.selectedEffortWeeks, week])).sort() }));
  }

  function removeWeek(week: string) {
    onChange((current) => current.selectedEffortWeeks.length === 1 ? current : ({ ...current, selectedEffortWeeks: current.selectedEffortWeeks.filter((item) => item !== week) }));
  }

  function applyPeriodView() {
    onChange((current) => ({ ...current, selectedEffortWeeks: availableReportingWeeks(weekInput, periodMode, current.sprints) }));
  }

  function addPlannedWork() {
    const item: WorkItem = { id: newId("work"), ...DEFAULT_ITEM_DRAFT, title: "New planned task", plannedHoursByWeek: Object.fromEntries(state.selectedEffortWeeks.map((week) => [week, 0])) };
    onChange((current) => ({ ...current, workItems: [...current.workItems, item] }));
  }

  const exportWeek = () => exportWorkTrackingWorkbooks({ state, weeks: [weekStartFromDate(weekInput)], personName });
  const exportSelected = () => exportWorkTrackingWorkbooks({ state, weeks: state.selectedEffortWeeks, personName });

  return (
    <div className="view-stack work-view">
      <div className="work-toolbar effort-toolbar">
        <div className="week-range-picker"><label className="work-week-control"><span>Add workweek</span><input type="date" max={PLANNING_MAX_DATE} value={weekInput} onChange={(event) => setWeekInput(weekStartFromDate(event.target.value))} /></label><button className="secondary-button" type="button" onClick={addWeek}><Plus size={16} /> Add week</button></div>
        <ExportButtons onExportWeek={exportWeek} onExportSelected={exportSelected} selectedCount={state.selectedEffortWeeks.length} />
      </div>

      <PeriodViewControl mode={periodMode} anchor={weekInput} sprints={state.sprints} onModeChange={setPeriodMode} onAnchorChange={(value) => setWeekInput(weekStartFromDate(value))} onApply={applyPeriodView} />

      <div className="selected-week-ranges" aria-label="Selected effort plan weeks">{state.selectedEffortWeeks.map((week) => <span key={week}>{formatWeekRange(week)}<button type="button" onClick={() => removeWeek(week)} disabled={state.selectedEffortWeeks.length === 1} aria-label={`Remove ${formatWeekRange(week)}`}>×</button></span>)}</div>

      <div className="work-summary-grid effort-week-summaries">{state.selectedEffortWeeks.map((week) => <div className="effort-week-card" key={week}><span>{formatWeekRange(week)}</span><HoursRule total={plannedHoursForWeek(state, week)} label="Plan meets 45-hour minimum" /><small>{formatHours(actualHoursForWeek(state, week))}h actual from Actuals</small></div>)}</div>

      <div className="work-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Interconnected planning</p><h2>Effort plan</h2></div><button className="secondary-button" type="button" onClick={addPlannedWork}><Plus size={16} /> Add planned work</button></div>
        <p className="work-helper">Actual hours are read from Actuals. Planned hours and classification flow into Timesheet Report. LLC is split into Legal and Ethics and Compliance; ARC is split into Real Estate, Audit and Risk, and Corporate Communications.</p>
        <div className="work-table-scroll">
          <table className="work-table effort-plan-table">
            <thead><tr><th>Workstream</th><th>Application</th><th>Phase</th><th>Task</th>{state.selectedEffortWeeks.map((week) => <th key={week}>Plan<small>{formatShortDate(week)}</small></th>)}{state.selectedEffortWeeks.map((week) => <th key={`actual-${week}`}>Actual<small>{formatShortDate(week)}</small></th>)}<th>Frequency</th><th>Notes</th></tr></thead>
            <tbody>{state.workItems.length ? state.workItems.map((item) => <tr key={item.id} className={isInnovationWorkItem(item) ? "innovation-row" : ""}>
              <td><select aria-label={`Workstream for ${item.title}`} value={item.workstream} onChange={(event) => updateItem(item.id, { workstream: event.target.value as Workstream })}>{state.options.workstreams.map((value) => <option key={value}>{value}</option>)}</select></td>
              <td><select aria-label={`Application for ${item.title}`} value={item.application} onChange={(event) => updateItem(item.id, { application: event.target.value })}><option value="">Select application</option>{state.options.applications.map((value) => <option key={value}>{value}</option>)}</select></td>
              <td><select aria-label={`Phase for ${item.title}`} value={item.phase} onChange={(event) => updateItem(item.id, { phase: event.target.value })}>{state.options.phases.map((value) => <option key={value}>{value}</option>)}</select></td>
              <td><input aria-label="Task description" value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} /><select aria-label={`Task type for ${item.title}`} value={item.taskType} onChange={(event) => updateItem(item.id, { taskType: event.target.value as TaskType })}>{state.options.taskTypes.map((value) => <option key={value}>{value}</option>)}</select>{Array.from(new Set(state.selectedEffortWeeks.flatMap((selectedWeek) => publicHolidayNamesForWorkItemWeek(state, item.id, selectedWeek)))).length > 0 && <small className="holiday-name-note">Holiday: {Array.from(new Set(state.selectedEffortWeeks.flatMap((selectedWeek) => publicHolidayNamesForWorkItemWeek(state, item.id, selectedWeek)))).join(", ")}</small>}</td>
              {state.selectedEffortWeeks.map((week) => <td key={week}><input className="hours-input" type="number" min="0" step="0.25" aria-label={`Planned hours for ${item.title}, ${formatWeekRange(week)}`} value={item.plannedHoursByWeek[week] ?? 0} onChange={(event) => updatePlannedHours(item.id, week, Number(event.target.value))} /><button className="use-actual-button" type="button" onClick={() => updatePlannedHours(item.id, week, workItemActualHoursForWeek(state, item.id, week))}>Use actual</button></td>)}
              {state.selectedEffortWeeks.map((week) => <td key={`actual-${week}`} className="read-only-hours"><strong>{formatHours(workItemActualHoursForWeek(state, item.id, week))}h</strong><small>from Actuals</small></td>)}
              <td><select aria-label={`Frequency for ${item.title}`} value={item.frequency} onChange={(event) => updateItem(item.id, { frequency: event.target.value as Frequency })}>{state.options.frequencies.map((value) => <option key={value}>{value}</option>)}</select></td>
              <td><textarea aria-label={`Notes for ${item.title}`} rows={2} value={item.notes} onChange={(event) => updateItem(item.id, { notes: event.target.value })} />{isInnovationWorkItem(item) && <small className="innovation-note">Excluded from Timesheet 45h</small>}</td>
            </tr>) : <tr><td colSpan={8 + (state.selectedEffortWeeks.length * 2)} className="work-empty">Add an Actual or planned work item to begin.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SelectionManagerView({ state, onChange, canEdit, editorUsername }: SelectionManagerViewProps) {
  const [drafts, setDrafts] = useState<Record<WorkOptionGroup, string>>({ workstreams: "", taskTypes: "", phases: "", applications: "", frequencies: "", leaveTypes: "" });
  const [message, setMessage] = useState("Changes apply immediately across Actuals, Effort Plan, Timesheet Report, and Dashboard.");
  const [sprintDraft, setSprintDraft] = useState(() => {
    const latestSprint = [...state.sprints].sort((left, right) => left.endDate.localeCompare(right.endDate)).pop();
    const startDate = latestSprint ? addDays(latestSprint.endDate, 1) : weekStartFromDate(todayIsoDate());
    return { name: `Sprint ${state.sprints.length + 1}`, startDate, endDate: addDays(startDate, 13) };
  });

  function sprintOverlaps(startDate: string, endDate: string, excludedId?: string) {
    return state.sprints.some((sprint) => sprint.id !== excludedId && startDate <= sprint.endDate && endDate >= sprint.startDate);
  }

  function addSprint(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return;
    }
    const name = sprintDraft.name.trim();
    if (!name || !sprintDraft.startDate || !sprintDraft.endDate || sprintDraft.startDate > sprintDraft.endDate) {
      setMessage("Enter a sprint name and a valid start and end date.");
      return;
    }
    if (sprintDraft.endDate > PLANNING_MAX_DATE) {
      setMessage(`Sprint end dates are available through ${PLANNING_MAX_DATE}.`);
      return;
    }
    if (state.sprints.some((sprint) => sprint.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setMessage(`“${name}” already exists.`);
      return;
    }
    if (sprintOverlaps(sprintDraft.startDate, sprintDraft.endDate)) {
      setMessage("Sprint dates cannot overlap another configured sprint.");
      return;
    }
    const sprint: SprintDefinition = { id: newId("sprint"), name, startDate: sprintDraft.startDate, endDate: sprintDraft.endDate };
    onChange((current) => ({ ...current, sprints: [...current.sprints, sprint].sort((left, right) => left.startDate.localeCompare(right.startDate)) }));
    const nextStart = addDays(sprint.endDate, 1);
    setSprintDraft({ name: `Sprint ${state.sprints.length + 2}`, startDate: nextStart, endDate: addDays(nextStart, 13) });
    setMessage(`Added “${name}”. Sprint view now uses ${formatShortDate(sprint.startDate)}–${formatShortDate(sprint.endDate)}.`);
  }

  function updateSprint(id: string, patch: Partial<SprintDefinition>) {
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return false;
    }
    const existing = state.sprints.find((sprint) => sprint.id === id);
    if (!existing) return false;
    const next = { ...existing, ...patch, name: (patch.name ?? existing.name).trim() };
    if (!next.name || !next.startDate || !next.endDate || next.startDate > next.endDate) {
      setMessage("Sprint start date must be on or before its end date.");
      return false;
    }
    if (next.endDate > PLANNING_MAX_DATE) {
      setMessage(`Sprint end dates are available through ${PLANNING_MAX_DATE}.`);
      return false;
    }
    if (state.sprints.some((sprint) => sprint.id !== id && sprint.name.toLocaleLowerCase() === next.name.toLocaleLowerCase())) {
      setMessage(`“${next.name}” already exists.`);
      return false;
    }
    if (sprintOverlaps(next.startDate, next.endDate, id)) {
      setMessage("Sprint dates cannot overlap another configured sprint.");
      return false;
    }
    onChange((current) => ({ ...current, sprints: current.sprints.map((sprint) => sprint.id === id ? next : sprint).sort((left, right) => left.startDate.localeCompare(right.startDate)) }));
    setMessage(`Updated “${next.name}”.`);
    return true;
  }

  function deleteSprint(id: string) {
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return;
    }
    const sprint = state.sprints.find((item) => item.id === id);
    if (!sprint) return;
    onChange((current) => ({ ...current, sprints: current.sprints.filter((item) => item.id !== id) }));
    setMessage(`Deleted “${sprint.name}”. Weekly work data was preserved.`);
  }

  function usageCount(group: WorkOptionGroup, option: string) {
    return state.workItems.filter((item) => {
      if (group === "workstreams") return item.workstream === option;
      if (group === "taskTypes") return item.taskType === option;
      if (group === "phases") return item.phase === option;
      if (group === "applications") return item.application === option;
      if (group === "leaveTypes") return item.title === option && item.taskType === "PTO";
      return item.frequency === option;
    }).length;
  }

  function addOption(group: WorkOptionGroup) {
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return;
    }
    const option = drafts[group].trim();
    if (!option) {
      setMessage("Enter an option before adding it.");
      return;
    }
    if (state.options[group].some((value) => value.toLocaleLowerCase() === option.toLocaleLowerCase())) {
      setMessage(`“${option}” already exists.`);
      return;
    }
    onChange((current) => ({ ...current, options: { ...current.options, [group]: [...current.options[group], option] } }));
    setDrafts((current) => ({ ...current, [group]: "" }));
    setMessage(`Added “${option}”.`);
  }

  function renameOption(group: WorkOptionGroup, previous: string, nextValue: string) {
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return false;
    }
    const next = nextValue.trim();
    if (!next || next === previous) return next === previous;
    if (state.options[group].some((value) => value !== previous && value.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      setMessage(`“${next}” already exists.`);
      return false;
    }
    onChange((current) => ({
      ...current,
      options: { ...current.options, [group]: current.options[group].map((value) => value === previous ? next : value) },
      workItems: current.workItems.map((item) => {
        if (group === "workstreams" && item.workstream === previous) return { ...item, workstream: next };
        if (group === "taskTypes" && item.taskType === previous) return { ...item, taskType: next };
        if (group === "phases" && item.phase === previous) return { ...item, phase: next };
        if (group === "applications" && item.application === previous) return { ...item, application: next };
        if (group === "leaveTypes" && item.title === previous && item.taskType === "PTO") return { ...item, title: next };
        if (group === "frequencies" && item.frequency === previous) return { ...item, frequency: next };
        return item;
      }),
    }));
    setMessage(PROTECTED_OPTIONS[group].has(previous)
      ? `Renamed reporting-linked value “${previous}” to “${next}” and updated its tasks.`
      : `Renamed “${previous}” to “${next}” and updated its tasks.`);
    return true;
  }

  function deleteOption(group: WorkOptionGroup, option: string) {
    if (!canEdit) {
      setMessage("Only owner/admin @aj.miller can edit Selection Manager.");
      return;
    }
    const used = usageCount(group, option);
    if (PROTECTED_OPTIONS[group].has(option)) {
      setMessage(`“${option}” is protected because it supports a reporting rule.`);
      return;
    }
    if (used) {
      setMessage(`“${option}” is used by ${used} ${used === 1 ? "task" : "tasks"}. Rename it to update those tasks before deleting.`);
      return;
    }
    if (state.options[group].length === 1) {
      setMessage("Each dropdown needs at least one option.");
      return;
    }
    onChange((current) => ({ ...current, options: { ...current.options, [group]: current.options[group].filter((value) => value !== option) } }));
    setMessage(`Deleted “${option}”.`);
  }

  return (
    <div className="view-stack work-view selection-manager-view">
      <div className="selection-manager-banner"><div><p className="eyebrow">Central configuration</p><h2>Dropdown values, options, and sprints</h2><span>Manage the selections and sprint calendar used by the connected reporting workflow.</span></div><strong>{canEdit ? `Owner edit access · @${editorUsername.replace(/^@/, "")}` : "Read-only access"}</strong></div>
      <div className="selection-message" role="status">{canEdit ? message : "Only owner/admin @aj.miller can edit Selection Manager. You can still review all configured values."}</div>
      <section className="work-panel sprint-manager-card">
        <div className="work-panel-heading"><div><p className="eyebrow">Reporting calendar</p><h2>Sprint dates</h2><p>Each sprint becomes an “Every sprint” view in Actuals, Effort Plan, Timesheet Report, Dashboard, and selected-period exports.</p></div><span>{state.sprints.length} configured</span></div>
        <div className="sprint-list">
          {state.sprints.length ? state.sprints.map((sprint) => <div className="sprint-row" key={sprint.id}>
            <label><span>Sprint name</span><input defaultValue={sprint.name} disabled={!canEdit} aria-label={`Name for ${sprint.name}`} onBlur={(event) => { if (!updateSprint(sprint.id, { name: event.target.value })) event.currentTarget.value = sprint.name; }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            <label><span>Start date</span><input type="date" max={PLANNING_MAX_DATE} defaultValue={sprint.startDate} disabled={!canEdit} aria-label={`Start date for ${sprint.name}`} onBlur={(event) => { if (!updateSprint(sprint.id, { startDate: event.target.value })) event.currentTarget.value = sprint.startDate; }} /></label>
            <label><span>End date</span><input type="date" max={PLANNING_MAX_DATE} defaultValue={sprint.endDate} disabled={!canEdit} aria-label={`End date for ${sprint.name}`} onBlur={(event) => { if (!updateSprint(sprint.id, { endDate: event.target.value })) event.currentTarget.value = sprint.endDate; }} /></label>
            <strong>{reportingWeeks(sprint.startDate, "sprint", [sprint]).length} {reportingWeeks(sprint.startDate, "sprint", [sprint]).length === 1 ? "workweek" : "workweeks"}</strong>
            <button type="button" onClick={() => deleteSprint(sprint.id)} disabled={!canEdit} aria-label={`Delete ${sprint.name}`} title={canEdit ? "Delete sprint definition; weekly data is preserved" : "Owner/admin access required"}><Trash2 size={16} /></button>
          </div>) : <div className="work-empty sprint-empty">No sprints configured. Add one below to enable the Every sprint view.</div>}
        </div>
        <form className="sprint-add-form" onSubmit={addSprint}>
          <label><span>Sprint name</span><input value={sprintDraft.name} disabled={!canEdit} onChange={(event) => setSprintDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Sprint 1" required /></label>
          <label><span>Start date</span><input type="date" max={PLANNING_MAX_DATE} value={sprintDraft.startDate} disabled={!canEdit} onChange={(event) => setSprintDraft((current) => ({ ...current, startDate: event.target.value }))} required /></label>
          <label><span>End date</span><input type="date" max={PLANNING_MAX_DATE} value={sprintDraft.endDate} disabled={!canEdit} onChange={(event) => setSprintDraft((current) => ({ ...current, endDate: event.target.value }))} required /></label>
          <button className="secondary-button" type="submit" disabled={!canEdit}><Plus size={15} /> Add sprint</button>
        </form>
      </section>
      <div className="selection-group-grid">
        {OPTION_GROUPS.map((group) => <section className="work-panel selection-group-card" key={group.key}>
          <div className="work-panel-heading"><div><h2>{group.label}</h2><p>{group.description}</p></div><span>{state.options[group.key].length}</span></div>
          <div className="selection-option-list">
            {state.options[group.key].map((option) => {
              const used = usageCount(group.key, option);
              const isProtected = PROTECTED_OPTIONS[group.key].has(option);
              return <div className="selection-option-row" key={option}>
                <input key={`${group.key}-${option}`} defaultValue={option} readOnly={!canEdit} aria-label={`${group.label} option ${option}`} title={isProtected && canEdit ? "Reporting-linked value · Owner can rename" : undefined} onBlur={(event) => { if (!renameOption(group.key, option, event.target.value)) event.currentTarget.value = option; }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
                <span>{isProtected ? `Rule-linked${used ? ` · ${used} ${used === 1 ? "task" : "tasks"}` : ""}` : used ? `${used} ${used === 1 ? "task" : "tasks"}` : "Unused"}</span>
                <button type="button" onClick={() => deleteOption(group.key, option)} disabled={!canEdit || isProtected || used > 0 || state.options[group.key].length === 1} aria-label={`Delete ${option}`} title={!canEdit ? "Owner/admin access required" : isProtected ? "Protected reporting option" : used ? "Option is currently in use" : "Delete option"}><Trash2 size={15} /></button>
              </div>;
            })}
          </div>
          <div className="selection-add-row"><input value={drafts[group.key]} disabled={!canEdit} onChange={(event) => setDrafts((current) => ({ ...current, [group.key]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOption(group.key); } }} placeholder={`Add ${group.label.toLocaleLowerCase().replace(/s$/, "")}`} aria-label={`Add ${group.label} option`} /><button className="secondary-button" type="button" disabled={!canEdit} onClick={() => addOption(group.key)}><Plus size={15} /> Add</button></div>
        </section>)}
      </div>
      <div className="timesheet-rule-banner ready"><strong>Reporting safeguards</strong><span>Owner @aj.miller can rename reporting-linked values, and Orbit updates dependent tasks automatically. Deletion remains disabled for rule-linked or in-use values to prevent accidental reporting damage.</span></div>
    </div>
  );
}

export function WorkDashboardView({ state, onChange, personName }: TrackingViewProps) {
  const [weekInput, setWeekInput] = useState(state.selectedEffortWeeks[0] ?? weekStartFromDate(todayIsoDate()));
  const [periodMode, setPeriodMode] = useState<ReportingPeriodMode>("weekly");
  const selectedWeeks = state.selectedEffortWeeks;

  const weeklyMetrics = useMemo(() => selectedWeeks.map((week) => {
    const entries = entriesForWorkweek(state, week);
    const actual = actualHoursForWeek(state, week);
    const planned = plannedHoursForWeek(state, week);
    const eligible = eligibleActualHoursForWeek(state, week);
    const reportTotal = buildTimesheetRows(state, week)
      .filter((row) => !row.excluded)
      .reduce((total, row) => total + row.total, 0);
    const utilized = utilizedHoursForWeek(state, week);
    return {
      week,
      actual,
      planned,
      eligible,
      reportTotal,
      utilized,
      testCases: entries.reduce((total, entry) => total + entry.testCaseCount, 0),
      bugs: entries.reduce((total, entry) => total + entry.bugCount, 0),
      holidays: Array.from(new Set(entries.map((entry) => entry.holidayName).filter((name): name is string => Boolean(name)))),
    };
  }), [selectedWeeks, state]);

  const totals = useMemo(() => weeklyMetrics.reduce((result, week) => ({
    actual: result.actual + week.actual,
    planned: result.planned + week.planned,
    eligible: result.eligible + week.eligible,
    report: result.report + week.reportTotal,
    utilized: result.utilized + week.utilized,
    testCases: result.testCases + week.testCases,
    bugs: result.bugs + week.bugs,
  }), { actual: 0, planned: 0, eligible: 0, report: 0, utilized: 0, testCases: 0, bugs: 0 }), [weeklyMetrics]);

  const workstreamMetrics = useMemo(() => state.options.workstreams.map((workstream) => {
    const itemIds = new Set(state.workItems.filter((item) => item.workstream === workstream).map((item) => item.id));
    const entries = state.actualEntries.filter((entry) => itemIds.has(entry.workItemId) && selectedWeeks.includes(weekStartFromDate(entry.date)));
    const itemById = new Map(state.workItems.map((item) => [item.id, item]));
    const actual = entries.reduce((total, entry) => total + hoursBetween(entry.startTime, entry.endTime), 0);
    const utilized = entries.reduce((total, entry) => {
      const item = itemById.get(entry.workItemId);
      return total + (item?.taskType === "Test" && /planning|execution/i.test(item.phase) ? hoursBetween(entry.startTime, entry.endTime) : 0);
    }, 0);
    const planned = state.workItems
      .filter((item) => item.workstream === workstream)
      .reduce((total, item) => total + selectedWeeks.reduce((sum, week) => sum + (item.plannedHoursByWeek[week] ?? 0), 0), 0);
    return {
      workstream,
      actual,
      planned,
      utilized,
      testCases: entries.reduce((total, entry) => total + entry.testCaseCount, 0),
      bugs: entries.reduce((total, entry) => total + entry.bugCount, 0),
    };
  }).filter((row) => row.actual || row.planned || row.testCases || row.bugs), [selectedWeeks, state.actualEntries, state.options.workstreams, state.workItems]);

  function addWeek() {
    const week = weekStartFromDate(weekInput);
    onChange((current) => ({ ...current, selectedEffortWeeks: Array.from(new Set([...current.selectedEffortWeeks, week])).sort() }));
  }

  function removeWeek(week: string) {
    onChange((current) => current.selectedEffortWeeks.length === 1 ? current : ({ ...current, selectedEffortWeeks: current.selectedEffortWeeks.filter((item) => item !== week) }));
  }

  function applyPeriodView() {
    onChange((current) => ({ ...current, selectedEffortWeeks: availableReportingWeeks(weekInput, periodMode, current.sprints) }));
  }

  const exportWeek = () => exportWorkTrackingWorkbooks({ state, weeks: [weekStartFromDate(weekInput)], personName });
  const exportSelected = () => exportWorkTrackingWorkbooks({ state, weeks: selectedWeeks, personName });
  const targetHours = REQUIRED_WEEKLY_HOURS * Math.max(1, selectedWeeks.length);
  const utilizationRate = targetHours ? totals.utilized / targetHours : 0;
  const maxChartHours = Math.max(REQUIRED_WEEKLY_HOURS, ...weeklyMetrics.flatMap((week) => [week.actual, week.planned]));

  return (
    <div className="view-stack work-view dashboard-view">
      <div className="work-toolbar effort-toolbar">
        <div className="week-range-picker"><label className="work-week-control"><span>Add dashboard week</span><input type="date" max={PLANNING_MAX_DATE} value={weekInput} onChange={(event) => setWeekInput(weekStartFromDate(event.target.value))} /></label><button className="secondary-button" type="button" onClick={addWeek}><Plus size={16} /> Add week</button></div>
        <ExportButtons onExportWeek={exportWeek} onExportSelected={exportSelected} selectedCount={selectedWeeks.length} />
      </div>

      <PeriodViewControl mode={periodMode} anchor={weekInput} sprints={state.sprints} onModeChange={setPeriodMode} onAnchorChange={(value) => setWeekInput(weekStartFromDate(value))} onApply={applyPeriodView} />

      <div className="selected-week-ranges" aria-label="Selected dashboard weeks">{selectedWeeks.map((week) => <span key={week}>{formatWeekRange(week)}<button type="button" onClick={() => removeWeek(week)} disabled={selectedWeeks.length === 1} aria-label={`Remove ${formatWeekRange(week)}`}>×</button></span>)}</div>

      <div className="dashboard-kpi-grid">
        <article className="dashboard-kpi"><span>Actual hours</span><strong>{formatHours(totals.actual)}h</strong><small>{selectedWeeks.filter((week) => actualHoursForWeek(state, week) >= REQUIRED_WEEKLY_HOURS).length}/{selectedWeeks.length} weeks meet 45h</small></article>
        <article className="dashboard-kpi"><span>Planned hours</span><strong>{formatHours(totals.planned)}h</strong><small>{selectedWeeks.filter((week) => plannedHoursForWeek(state, week) >= REQUIRED_WEEKLY_HOURS).length}/{selectedWeeks.length} weeks meet 45h</small></article>
        <article className="dashboard-kpi"><span>Timesheet hours</span><strong>{formatHours(totals.report)}h</strong><small>{formatHours(Math.max(0, totals.actual - totals.eligible))}h Innovation excluded</small></article>
        <article className="dashboard-kpi utilization"><span>Utilization</span><strong>{(utilizationRate * 100).toFixed(1)}%</strong><small>{formatHours(totals.utilized)}h Test Planning / Execution</small></article>
        <article className="dashboard-kpi"><span>Test cases</span><strong>{totals.testCases}</strong><small>Worked on across selected weeks</small></article>
        <article className="dashboard-kpi"><span>Bugs</span><strong>{totals.bugs}</strong><small>Worked on across selected weeks</small></article>
      </div>

      <div className="work-panel dashboard-chart-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Capacity trend</p><h2>Actual vs planned hours</h2></div><span>45-hour weekly target</span></div>
        <div className="dashboard-week-chart" role="img" aria-label="Actual and planned hours by selected week">
          {weeklyMetrics.map((week) => <div className="dashboard-week-bar" key={week.week}>
            <div className="dashboard-bar-area">
              <span className="dashboard-target-line" style={{ bottom: `${(REQUIRED_WEEKLY_HOURS / maxChartHours) * 100}%` }} aria-hidden="true" />
              <i className="actual" style={{ height: `${(week.actual / maxChartHours) * 100}%` }} title={`${formatHours(week.actual)} actual hours`} />
              <i className="planned" style={{ height: `${(week.planned / maxChartHours) * 100}%` }} title={`${formatHours(week.planned)} planned hours`} />
            </div>
            <strong>{formatShortDate(week.week)}</strong><span>{formatHours(week.actual)} / {formatHours(week.planned)}h</span>
          </div>)}
        </div>
        <div className="dashboard-chart-legend"><span><i className="actual" /> Actual</span><span><i className="planned" /> Planned</span><span><i className="target" /> 45h target</span></div>
      </div>

      <div className="work-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Weekly controls</p><h2>Requirement and delivery health</h2></div><span>{selectedWeeks.length} selected {selectedWeeks.length === 1 ? "week" : "weeks"}</span></div>
        <div className="work-table-scroll">
          <table className="work-table dashboard-week-table">
            <thead><tr><th>Week range</th><th>Actuals</th><th>Effort Plan</th><th>Eligible Actuals</th><th>Timesheet</th><th>Utilized</th><th>Utilization</th><th>Test cases</th><th>Bugs</th><th>Public holidays</th></tr></thead>
            <tbody>{weeklyMetrics.map((week) => <tr key={week.week}>
              <td><strong>{formatWeekRange(week.week)}</strong></td>
              <td><strong>{formatHours(week.actual)}h</strong><small className={week.actual >= REQUIRED_WEEKLY_HOURS ? "metric-pass" : "metric-gap"}>{week.actual >= REQUIRED_WEEKLY_HOURS ? "Meets minimum" : `${formatHours(REQUIRED_WEEKLY_HOURS - week.actual)}h short`}</small></td>
              <td><strong>{formatHours(week.planned)}h</strong><small className={week.planned >= REQUIRED_WEEKLY_HOURS ? "metric-pass" : "metric-gap"}>{week.planned >= REQUIRED_WEEKLY_HOURS ? "Meets minimum" : `${formatHours(REQUIRED_WEEKLY_HOURS - week.planned)}h short`}</small></td>
              <td>{formatHours(week.eligible)}h</td>
              <td><strong>{formatHours(week.reportTotal)}h</strong><small className={Math.abs(week.reportTotal - REQUIRED_WEEKLY_HOURS) < .001 ? "metric-pass" : "metric-gap"}>{Math.abs(week.reportTotal - REQUIRED_WEEKLY_HOURS) < .001 ? "Exactly 45h" : "Not ready"}</small></td>
              <td>{formatHours(week.utilized)}h</td>
              <td>{((week.utilized / REQUIRED_WEEKLY_HOURS) * 100).toFixed(1)}%</td>
              <td>{week.testCases}</td><td>{week.bugs}</td><td>{week.holidays.length ? week.holidays.join(", ") : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="work-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Portfolio view</p><h2>Workstream breakdown</h2></div><span>Selected weeks combined</span></div>
        <div className="work-table-scroll">
          <table className="work-table dashboard-workstream-table">
            <thead><tr><th>Workstream</th><th>Actual</th><th>Planned</th><th>Variance</th><th>Utilized</th><th>Test cases</th><th>Bugs</th></tr></thead>
            <tbody>{workstreamMetrics.length ? workstreamMetrics.map((row) => <tr key={row.workstream}><td><span className={`workstream-pill ${row.workstream === "Innovation" ? "innovation" : ""}`}>{row.workstream}</span></td><td>{formatHours(row.actual)}h</td><td>{formatHours(row.planned)}h</td><td className={row.actual - row.planned > 0 ? "metric-gap" : "metric-pass"}>{formatHours(row.actual - row.planned)}h</td><td>{formatHours(row.utilized)}h</td><td>{row.testCases}</td><td>{row.bugs}</td></tr>) : <tr><td className="work-empty" colSpan={7}>Add Actuals or planned work to populate the workstream dashboard.</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function TimesheetReportView({ state, onChange, personName }: TrackingViewProps) {
  const week = weekStartFromDate(state.timesheetWeek);
  const [periodMode, setPeriodMode] = useState<ReportingPeriodMode>("weekly");
  const [leaveDate, setLeaveDate] = useState(week);
  const [leaveType, setLeaveType] = useState(state.options.leaveTypes[0] ?? "Vacation Leave");
  const [leaveStart, setLeaveStart] = useState("08:00");
  const [leaveEnd, setLeaveEnd] = useState("17:00");
  const [holidayName, setHolidayName] = useState("");
  const [leaveDetails, setLeaveDetails] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const initialUtilizedTask = state.workItems.find((item) => item.taskType === "Test" && /planning|execution/i.test(item.phase));
  const [utilizedTaskChoice, setUtilizedTaskChoice] = useState(initialUtilizedTask?.id ?? NEW_UTILIZED_TASK);
  const [utilizedDate, setUtilizedDate] = useState(week);
  const [utilizedStart, setUtilizedStart] = useState("08:00");
  const [utilizedEnd, setUtilizedEnd] = useState("09:00");
  const [utilizedTitle, setUtilizedTitle] = useState("Test planning");
  const [utilizedWorkstream, setUtilizedWorkstream] = useState(state.options.workstreams[0] ?? "Legal");
  const [utilizedApplication, setUtilizedApplication] = useState("");
  const [utilizedPhase, setUtilizedPhase] = useState("Planning");
  const [utilizedDetails, setUtilizedDetails] = useState("");
  const [utilizedTestCases, setUtilizedTestCases] = useState(0);
  const [utilizedBugs, setUtilizedBugs] = useState(0);
  const [utilizedMessage, setUtilizedMessage] = useState("");
  const periodWeeks = availableReportingWeeks(week, periodMode, state.sprints);
  const dates = weekdayDates(week);
  const eligibleActual = eligibleActualHoursForWeek(state, week);
  const actualTotal = actualHoursForWeek(state, week);
  const innovationHours = Math.max(0, actualTotal - eligibleActual);
  const rows = buildTimesheetRows(state, week);
  const includedRows = rows.filter((row) => !row.excluded);
  const reportTotal = includedRows.reduce((total, row) => total + row.total, 0);
  const dayTotals = dates.map((_, index) => includedRows.reduce((total, row) => total + row.hours[index], 0));
  const ready = Math.abs(reportTotal - REQUIRED_WEEKLY_HOURS) < 0.001;

  function setWeek(value: string) {
    const nextWeek = weekStartFromDate(value);
    onChange((current) => ({ ...current, timesheetWeek: nextWeek }));
    setLeaveDate(nextWeek);
    setUtilizedDate(nextWeek);
  }

  function addUtilizedWork(event: FormEvent) {
    event.preventDefault();
    const hours = hoursBetween(utilizedStart, utilizedEnd);
    if (utilizedDate > PLANNING_MAX_DATE) {
      setUtilizedMessage(`Dates are available through ${PLANNING_MAX_DATE}.`);
      return;
    }
    if (!hours) {
      setUtilizedMessage("End time must be later than start time.");
      return;
    }
    if (utilizedTaskChoice === NEW_UTILIZED_TASK && !utilizedTitle.trim()) {
      setUtilizedMessage("Add a task name.");
      return;
    }
    const targetWeek = weekStartFromDate(utilizedDate);
    onChange((current) => {
      const existing = current.workItems.find((item) => item.id === utilizedTaskChoice);
      const workItemId = existing?.id ?? newId("work");
      const plannedHours = (existing?.plannedHoursByWeek[targetWeek] ?? 0) + hours;
      const item: WorkItem = existing
        ? { ...existing, plannedHoursByWeek: { ...existing.plannedHoursByWeek, [targetWeek]: plannedHours } }
        : {
          id: workItemId,
          title: utilizedTitle.trim(),
          taskType: "Test",
          workstream: utilizedWorkstream,
          application: utilizedApplication,
          phase: utilizedPhase,
          frequency: current.options.frequencies.includes("As needed") ? "As needed" : current.options.frequencies[0],
          notes: "Utilized work entered from Timesheet Report.",
          plannedHoursByWeek: { [targetWeek]: plannedHours },
        };
      const entry: ActualEntry = {
        id: newId("actual"),
        date: utilizedDate,
        startTime: utilizedStart,
        endTime: utilizedEnd,
        workItemId,
        details: utilizedDetails.trim() || "Utilized work entered from Timesheet Report.",
        testCaseCount: Math.max(0, Math.floor(utilizedTestCases)),
        bugCount: Math.max(0, Math.floor(utilizedBugs)),
        entrySource: "timesheet-source",
      };
      return {
        ...current,
        workItems: existing ? current.workItems.map((candidate) => candidate.id === existing.id ? item : candidate) : [...current.workItems, item],
        actualEntries: [entry, ...current.actualEntries],
        selectedEffortWeeks: Array.from(new Set([...current.selectedEffortWeeks, targetWeek])).sort(),
        timesheetWeek: targetWeek,
      };
    });
    setUtilizedDetails("");
    setUtilizedTestCases(0);
    setUtilizedBugs(0);
    setUtilizedMessage(`${formatHours(hours)}h utilized work added to Actuals, Effort Plan, Timesheet Report, and Dashboard.`);
  }

  function scheduleLeave(event: FormEvent) {
    event.preventDefault();
    const hours = hoursBetween(leaveStart, leaveEnd);
    if (leaveDate > PLANNING_MAX_DATE) {
      setLeaveMessage(`Dates are available through ${PLANNING_MAX_DATE}.`);
      return;
    }
    if (!hours) {
      setLeaveMessage("End time must be later than start time.");
      return;
    }
    const isPublicHoliday = leaveType.trim().toLocaleLowerCase() === "public holiday";
    if (isPublicHoliday && !holidayName.trim()) {
      setLeaveMessage("Specify the public holiday name.");
      return;
    }
    const targetWeek = weekStartFromDate(leaveDate);
    onChange((current) => {
      const existing = current.workItems.find((item) => item.taskType === "PTO" && item.title === leaveType);
      const workItemId = existing?.id ?? newId("work");
      const plannedHours = (existing?.plannedHoursByWeek[targetWeek] ?? 0) + hours;
      const updatedItem: WorkItem = existing
        ? { ...existing, phase: leaveType.toLocaleLowerCase().includes("holiday") ? "Holiday" : "Leave", plannedHoursByWeek: { ...existing.plannedHoursByWeek, [targetWeek]: plannedHours } }
        : {
          id: workItemId,
          title: leaveType,
          taskType: "PTO",
          workstream: current.options.workstreams.includes("Shared Services") ? "Shared Services" : current.options.workstreams.includes("Other") ? "Other" : current.options.workstreams[0],
          application: "",
          phase: leaveType.toLocaleLowerCase().includes("holiday") ? "Holiday" : "Leave",
          frequency: current.options.frequencies.includes("As needed") ? "As needed" : current.options.frequencies[0],
          notes: "Scheduled from Timesheet Report in advance.",
          plannedHoursByWeek: { [targetWeek]: plannedHours },
        };
      const entry: ActualEntry = {
        id: newId("actual"),
        date: leaveDate,
        startTime: leaveStart,
        endTime: leaveEnd,
        workItemId,
        holidayName: isPublicHoliday ? holidayName.trim() : undefined,
        details: leaveDetails.trim() || (isPublicHoliday ? `${holidayName.trim()} · Philippines` : `Scheduled ${leaveType.toLocaleLowerCase()} in advance.`),
        testCaseCount: 0,
        bugCount: 0,
        entrySource: "scheduled-advance",
      };
      return {
        ...current,
        workItems: existing ? current.workItems.map((item) => item.id === existing.id ? updatedItem : item) : [...current.workItems, updatedItem],
        actualEntries: [entry, ...current.actualEntries],
        selectedEffortWeeks: Array.from(new Set([...current.selectedEffortWeeks, targetWeek])).sort(),
        timesheetWeek: targetWeek,
      };
    });
    setHolidayName("");
    setLeaveDetails("");
    setLeaveMessage(`${formatHours(hours)}h ${leaveType.toLocaleLowerCase()} scheduled and shared with Actuals, Effort Plan, and Dashboard.`);
  }

  function setTimesheetOverride(workItemId: string, date: string, rawValue: string) {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 24) return;
    const key = timesheetOverrideKey(week, workItemId, date);
    onChange((current) => ({ ...current, timesheetOverrides: { ...current.timesheetOverrides, [key]: Math.round(numeric * 4) / 4 } }));
  }

  function resetTimesheetOverride(workItemId: string, date?: string) {
    onChange((current) => {
      const next = { ...current.timesheetOverrides };
      if (date) delete next[timesheetOverrideKey(week, workItemId, date)];
      else dates.forEach((day) => delete next[timesheetOverrideKey(week, workItemId, day)]);
      return { ...current, timesheetOverrides: next };
    });
  }

  const exportWeek = () => exportWorkTrackingWorkbooks({ state, weeks: [week], personName });
  const exportSelected = () => exportWorkTrackingWorkbooks({ state, weeks: periodWeeks, personName });

  return (
    <div className="view-stack work-view">
      <div className="work-toolbar timesheet-toolbar">
        <div className="week-navigation"><button type="button" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ArrowLeft size={17} /></button><label className="work-week-control"><span>Report week</span><input type="date" max={PLANNING_MAX_DATE} value={week} onChange={(event) => setWeek(event.target.value)} /></label><button type="button" onClick={() => setWeek(addDays(week, 7))} disabled={week >= PLANNING_MAX_WEEK} aria-label="Next week"><ArrowRight size={17} /></button></div>
        <span className="work-range-label">{formatWeekRange(week)}</span>
        <ExportButtons onExportWeek={exportWeek} onExportSelected={exportSelected} selectedCount={periodWeeks.length} weekDisabled={!ready} />
      </div>

      <PeriodViewControl mode={periodMode} anchor={week} sprints={state.sprints} onModeChange={setPeriodMode} onAnchorChange={setWeek} />

      {periodWeeks.length > 1 && <div className="work-panel period-summary-panel"><div className="work-panel-heading"><div><p className="eyebrow">Period overview</p><h2>{formatReportingPeriod(week, periodMode, undefined, state.sprints)}</h2></div><span>Each Timesheet workweek must equal 45h</span></div><div className="work-table-scroll"><table className="work-table period-summary-table timesheet-period-table"><thead><tr><th>Workweek</th><th>Eligible Actuals</th><th>Timesheet total</th><th>Innovation</th><th>Status</th><th>Detail</th></tr></thead><tbody>{periodWeeks.map((periodWeek) => {
        const eligible = eligibleActualHoursForWeek(state, periodWeek);
        const total = buildTimesheetRows(state, periodWeek).filter((row) => !row.excluded).reduce((sum, row) => sum + row.total, 0);
        const innovation = Math.max(0, actualHoursForWeek(state, periodWeek) - eligible);
        const isReady = Math.abs(total - REQUIRED_WEEKLY_HOURS) < .001;
        return <tr key={periodWeek}><td><strong>{formatWeekRange(periodWeek)}</strong></td><td>{formatHours(eligible)}h</td><td>{formatHours(total)}h</td><td>{formatHours(innovation)}h</td><td><small className={isReady ? "metric-pass" : "metric-gap"}>{isReady ? "Ready" : "Needs review"}</small></td><td><button className="use-actual-button" type="button" onClick={() => setWeek(periodWeek)}>Edit week</button></td></tr>;
      })}</tbody></table></div></div>}

      <div className="work-summary-grid timesheet-summary">
        <HoursRule total={reportTotal} exact label="Timesheet ready to export" />
        <div className="work-stat"><span>Eligible Actuals</span><strong>{formatHours(eligibleActual)}h</strong><small>{eligibleActual > 45 ? "Normalized proportionally to 45h" : "Innovation excluded"}</small></div>
        <div className="work-stat innovation-stat"><span>Innovation</span><strong>{formatHours(innovationHours)}h</strong><small>Visible, outside total</small></div>
      </div>

      <div className={`timesheet-rule-banner ${ready ? "ready" : "needs-hours"}`}><strong>{ready ? "Exactly 45 reportable hours" : reportTotal < REQUIRED_WEEKLY_HOURS ? `${formatHours(REQUIRED_WEEKLY_HOURS - reportTotal)} more report hours needed` : `${formatHours(reportTotal - REQUIRED_WEEKLY_HOURS)} report hours must be removed`}</strong><span>{eligibleActual > 45 ? `Orbit proportionally allocates 45 hours from ${formatHours(eligibleActual)} eligible actual hours. ` : ""}Editable overrides are marked in the table. Innovation effort remains visible but never contributes to the Timesheet total.</span></div>

      <div className="work-panel utilized-source-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Connected source entry</p><h2>Add utilized work from Timesheet Report</h2></div><span>Test Planning / Test Execution</span></div>
        <form className="utilized-source-form" onSubmit={addUtilizedWork}>
          <label className="field-label">Date<input type="date" max={PLANNING_MAX_DATE} value={utilizedDate} onChange={(event) => setUtilizedDate(event.target.value)} required /></label>
          <label className="field-label">Start time<input type="time" value={utilizedStart} onChange={(event) => setUtilizedStart(event.target.value)} required /></label>
          <label className="field-label">End time<input type="time" value={utilizedEnd} onChange={(event) => setUtilizedEnd(event.target.value)} required /></label>
          <label className="field-label utilized-task-select">Task<select value={utilizedTaskChoice} onChange={(event) => setUtilizedTaskChoice(event.target.value)}>{state.workItems.filter((item) => item.taskType === "Test" && /planning|execution/i.test(item.phase)).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.phase}</option>)}<option value={NEW_UTILIZED_TASK}>+ Add new utilized task</option></select></label>
          <label className="field-label">Test cases<input type="number" min="0" step="1" value={utilizedTestCases} onChange={(event) => setUtilizedTestCases(Math.max(0, Number(event.target.value)))} /></label>
          <label className="field-label">Bugs<input type="number" min="0" step="1" value={utilizedBugs} onChange={(event) => setUtilizedBugs(Math.max(0, Number(event.target.value)))} /></label>
          {utilizedTaskChoice === NEW_UTILIZED_TASK && <fieldset className="utilized-new-task-fields"><legend>New utilized task</legend><label className="field-label">Task name<input value={utilizedTitle} onChange={(event) => setUtilizedTitle(event.target.value)} required /></label><label className="field-label">Workstream<select value={utilizedWorkstream} onChange={(event) => setUtilizedWorkstream(event.target.value)}>{state.options.workstreams.filter((value) => value !== "Innovation").map((value) => <option key={value}>{value}</option>)}</select></label><label className="field-label">Application<select value={utilizedApplication} onChange={(event) => setUtilizedApplication(event.target.value)}><option value="">Select application</option>{state.options.applications.map((value) => <option key={value}>{value}</option>)}</select></label><label className="field-label">Utilized phase<select value={utilizedPhase} onChange={(event) => setUtilizedPhase(event.target.value)}><option>Planning</option><option>Execution</option></select></label></fieldset>}
          <label className="field-label utilized-entry-details">Details<input value={utilizedDetails} onChange={(event) => setUtilizedDetails(event.target.value)} placeholder="What was completed?" /></label>
          <button className="primary-button" type="submit"><Plus size={16} /> Add {formatHours(hoursBetween(utilizedStart, utilizedEnd))}h utilized</button>
          <span className={utilizedMessage.includes("must") || utilizedMessage.includes("Add a") ? "form-message error" : "form-message"}>{utilizedMessage}</span>
        </form>
      </div>

      <div className="work-panel advance-leave-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Plan an absence</p><h2>Schedule leave or holiday in advance</h2></div><span>Flows to all four reporting pages</span></div>
        <form className="advance-leave-form" onSubmit={scheduleLeave}>
          <label className="field-label">Date<input type="date" max={PLANNING_MAX_DATE} value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} required /></label>
          <label className="field-label">Type<select value={leaveType} onChange={(event) => { setLeaveType(event.target.value); if (event.target.value.trim().toLocaleLowerCase() !== "public holiday") setHolidayName(""); }}>{state.options.leaveTypes.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field-label">Start time<input type="time" value={leaveStart} onChange={(event) => setLeaveStart(event.target.value)} required /></label>
          <label className="field-label">End time<input type="time" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} required /></label>
          <label className="field-label">Holiday name<input value={holidayName} disabled={leaveType.trim().toLocaleLowerCase() !== "public holiday"} onChange={(event) => setHolidayName(event.target.value)} placeholder={leaveType.trim().toLocaleLowerCase() === "public holiday" ? "e.g., National Heroes Day" : "Not applicable"} required={leaveType.trim().toLocaleLowerCase() === "public holiday"} /></label>
          <label className="field-label advance-leave-details">Details<input value={leaveDetails} onChange={(event) => setLeaveDetails(event.target.value)} placeholder="Optional note" /></label>
          <button className="primary-button" type="submit"><Plus size={16} /> Schedule {formatHours(hoursBetween(leaveStart, leaveEnd))}h</button>
          <span className={leaveMessage.includes("must") || leaveMessage.includes("Specify") ? "form-message error" : "form-message"}>{leaveMessage}</span>
        </form>
      </div>

      <div className="work-panel timesheet-panel">
        <div className="work-panel-heading"><div><p className="eyebrow">Editable derived report</p><h2>Timesheet Report</h2></div><span>{formatWeekRange(week)}</span></div>
        <div className="work-table-scroll">
          <table className="work-table timesheet-table">
            <thead><tr><th>Task type</th><th>Task</th><th>Subcategory</th>{dates.map((day, index) => <th key={day}>{WEEKDAY_LABELS[index]}<small>{formatShortDate(day)}</small></th>)}<th>Total</th></tr><tr className="day-total-row"><th colSpan={3}>Included day totals</th>{dayTotals.map((total, index) => <th key={dates[index]}>{formatHours(total)}</th>)}<th>{formatHours(reportTotal)}</th></tr></thead>
            <tbody>{rows.length ? rows.map((row) => <tr key={row.workItem.id} className={row.excluded ? "innovation-row" : ""}><td><span>{row.workItem.taskType}</span>{row.excluded && <small className="innovation-note">Excluded</small>}</td><td><strong>{row.workItem.workstream}</strong><small>Actuals task: {workItemDisplayTitleForWeek(state, row.workItem, week)}{row.workItem.application ? ` · ${row.workItem.application}` : ""}</small>{!row.excluded && dates.some((date) => timesheetOverrideKey(week, row.workItem.id, date) in state.timesheetOverrides) && <button className="reset-row-overrides" type="button" onClick={() => resetTimesheetOverride(row.workItem.id)}>Reset row to Actuals</button>}</td><td>{row.workItem.phase || "—"}</td>{row.hours.map((hours, index) => {
              const overrideKey = timesheetOverrideKey(week, row.workItem.id, dates[index]);
              const overridden = overrideKey in state.timesheetOverrides;
              return <td key={dates[index]}>{row.excluded ? (hours ? formatHours(hours) : "—") : <div className={`timesheet-edit-cell ${overridden ? "overridden" : ""}`}><input key={`${overrideKey}-${hours}`} type="number" min="0" max="24" step="0.25" defaultValue={formatHours(hours)} aria-label={`${row.workItem.title} hours for ${dates[index]}`} onBlur={(event) => setTimesheetOverride(row.workItem.id, dates[index], event.target.value)} />{overridden && <button type="button" onClick={() => resetTimesheetOverride(row.workItem.id, dates[index])} aria-label={`Reset ${row.workItem.title} for ${dates[index]}`} title="Reset to Actuals-derived value">↺</button>}</div>}</td>;
            })}<td><strong>{formatHours(row.total)}h</strong></td></tr>) : <tr><td colSpan={4 + dates.length} className="work-empty">Add Actuals for this week to generate the report.</td></tr>}</tbody>
            <tfoot><tr><td colSpan={3 + dates.length}>Timesheet included total</td><td>{formatHours(reportTotal)}h / 45h</td></tr></tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
