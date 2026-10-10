"use client";

import { CheckCircle2, Clock3, CalendarDays, Pencil, Plus, Target } from "lucide-react";
import { Fragment, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { Task, TaskStatus } from "./page";

export type TaskCellPatch = Partial<Pick<Task, "title" | "project" | "notes">>;

type Props = {
  tasks: Task[];
  projects: { name: string }[];
  title: string;
  groupByDue?: boolean;
  planner?: boolean;
  empty?: string;
  onAdd: () => void;
  onEdit: (task: Task) => void;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onCellChange: (id: number, patch: TaskCellPatch) => void;
};

const DUE_ORDER = ["Today", "Tomorrow", "Friday", "Monday", "Next week", "Next month", "Someday"];

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h${remainder ? ` ${remainder}m` : ""}` : `${remainder}m`;
}

function completionDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function EditableCell({ value, label, multiline = false, required = false, onSave }: {
  value: string; label: string; multiline?: boolean; required?: boolean; onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const trigger = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);
  const editor = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  function finish(save: boolean, restoreFocus = false) {
    if (finished.current) return;
    if (save && required && !draft.trim()) {
      editor.current?.setCustomValidity("Enter a task name.");
      editor.current?.reportValidity();
      editor.current?.focus();
      return;
    }
    finished.current = true;
    if (save && draft !== value) onSave(draft);
    setEditing(false);
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus());
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false, true); }
    if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault(); finish(true, true);
    }
  }

  if (!editing) return <button ref={trigger} type="button" className={`sheet-cell-button${value ? "" : " sheet-placeholder"}`} aria-label={label} title={label} onClick={() => { finished.current = false; setDraft(value); setEditing(true); }}>{value || "Add remarks…"}</button>;
  const props = {
    autoFocus: true, value: draft, "aria-label": label,
    className: "sheet-cell-editor", onBlur: () => finish(true), onKeyDown: keyDown,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { event.currentTarget.setCustomValidity(""); setDraft(event.target.value); },
  };
  return multiline
    ? <textarea {...props} ref={element => { editor.current = element; }} rows={3} maxLength={10000} />
    : <input {...props} ref={element => { editor.current = element; }} required={required} maxLength={500} />;
}

export function TaskSheet({ tasks, projects, title, groupByDue = false, planner = false, empty = "Add a task or adjust your filters to see work here.", onAdd, onEdit, onStatusChange, onCellChange }: Props) {
  const dueDates = Array.from(new Set(tasks.map(task => task.due)));
  const days = [...DUE_ORDER.filter(day => dueDates.includes(day)), ...dueDates.filter(day => !DUE_ORDER.includes(day)).sort()];
  const groups = groupByDue ? days.map(day => ({ name: day, tasks: tasks.filter(task => task.due === day) })) : [{ name: "", tasks }];
  const minutes = tasks.reduce((total, task) => total + task.duration, 0);
  const overloaded = days.filter(day => tasks.filter(task => task.due === day).reduce((total, task) => total + task.duration, 0) > 480).length;

  return <div className="task-sheet-view">
    {planner && <section className="planner-summary" aria-label="Planner capacity summary">
      <article><span className="stat-icon blue"><Clock3 size={20} /></span><div><strong>{duration(minutes)}</strong><small>Planned effort</small></div></article>
      <article><span className="stat-icon lime"><CalendarDays size={20} /></span><div><strong>{days.length}</strong><small>Active time buckets</small></div></article>
      <article><span className="stat-icon blue"><Target size={20} /></span><div><strong>{overloaded}</strong><small>Over-capacity days</small></div></article>
    </section>}
    <section className="task-sheet" aria-label={title}>
      <div className="task-sheet-heading"><div><h2>{title}</h2><p>{tasks.length} {tasks.length === 1 ? "task" : "tasks"} · Click a cell to edit</p></div><button type="button" className="secondary-button" onClick={onAdd}><Plus size={15} />Add task</button></div>
      <div className="task-sheet-scroll" tabIndex={0} role="region" aria-label="Task sheet, scroll to see all columns">
        <table className="task-sheet-table">
          <caption className="sheet-sr-only">{title}. Workstream is the task’s project. Remarks are its notes. Status changes save automatically.</caption>
          <colgroup><col className="sheet-workstream-col" /><col className="sheet-task-col" /><col className="sheet-status-col" /><col className="sheet-date-col" /><col className="sheet-remarks-col" /></colgroup>
          <thead><tr><th scope="col">Workstream</th><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Date Completed</th><th scope="col">Remarks</th></tr></thead>
          <tbody>{groups.map(group => <Fragment key={group.name}>
            {groupByDue && <tr className="sheet-group-row"><th scope="rowgroup" colSpan={5}><span>{group.name}</span><small>{group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"}{planner ? ` · ${duration(group.tasks.reduce((total, task) => total + task.duration, 0))} planned · 8h daily guide` : ""}</small></th></tr>}
            {group.tasks.map(task => {
              const status = task.completed ? "done" : task.status;
              return <tr key={task.id} data-task-id={task.id}>
                <td><select className="sheet-workstream" aria-label={`Workstream for ${task.title}`} value={task.project} onChange={event => onCellChange(task.id, { project: event.target.value })}>
                  {!projects.some(project => project.name === task.project) && <option value={task.project}>{task.project || "No workstream"}</option>}
                  {projects.map(project => <option key={project.name} value={project.name}>{project.name}</option>)}
                </select></td>
                <td><div className="sheet-task-cell"><EditableCell value={task.title} required label={`Task name for ${task.title}`} onSave={value => onCellChange(task.id, { title: value })} /><button type="button" className="sheet-task-edit" aria-label={`Open details for ${task.title}`} title="Open task details" onClick={() => onEdit(task)}><Pencil size={14} /></button></div></td>
                <td><div className={`sheet-status-pill sheet-status-${status}`}><select aria-label={`Status for ${task.title}`} value={status} onChange={event => onStatusChange(task.id, event.target.value as TaskStatus)}><option value="todo">Not Started</option><option value="in-progress">In Progress</option><option value="done">Complete</option></select><span aria-hidden="true" /></div></td>
                <td className="sheet-completed-date">{task.completed && task.completedAt && !Number.isNaN(Date.parse(task.completedAt)) ? <time dateTime={task.completedAt}>{completionDate(task.completedAt)}</time> : <span aria-label="No completion date">—</span>}</td>
                <td><EditableCell value={task.notes} multiline label={`Remarks for ${task.title}`} onSave={value => onCellChange(task.id, { notes: value })} /></td>
              </tr>;
            })}
          </Fragment>)}</tbody>
        </table>
        {!tasks.length && <div className="empty-list"><CheckCircle2 size={30} /><h3>No tasks to show</h3><p>{empty}</p><button type="button" className="secondary-button" onClick={onAdd}><Plus size={15} />Add task</button></div>}
      </div>
      <p className="task-sheet-footer">Changes save automatically. Completing a task records its date and moves it to Completed.</p>
    </section>
  </div>;
}
