"use client";

import { CalendarDays, Check, Clock3, Grip, Pencil, Plus, StickyNote, Zap } from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";
import type { Task, TaskStatus } from "./page";

const COLUMNS: { status: TaskStatus; title: string; caption: string; color: string }[] = [
  { status: "todo", title: "To do", caption: "Ideas ready for their moment", color: "#c38c13" },
  { status: "in-progress", title: "In progress", caption: "A little closer every day", color: "#3564c5" },
  { status: "done", title: "Done", caption: "Small wins, real momentum", color: "#208062" },
];

const NOTE_COLORS = ["butter", "rose", "sky", "mint", "lavender", "peach"];
const NOTE_TILTS = [-1.2, 0.8, -0.6, 1.1, -0.9, 0.5];
const TASK_DRAG_TYPE = "application/x-orbit-kanban-task";

function noteStyle(task: Task): CSSProperties {
  return { "--note-tilt": `${NOTE_TILTS[Math.abs(task.id) % NOTE_TILTS.length]}deg` } as CSSProperties;
}

export function KanbanView({ tasks, onAdd, onMove, onEdit, onFocus }: {
  tasks: Task[];
  onAdd: () => void;
  onMove: (id: number, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onFocus: (task: Task) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const doneCount = tasks.filter((task) => task.completed || task.status === "done").length;

  function move(task: Task, status: TaskStatus) {
    const currentStatus = task.completed ? "done" : task.status;
    if (currentStatus === status) return;
    onMove(task.id, status);
    setAnnouncement(`${task.title} moved to ${COLUMNS.find((column) => column.status === status)?.title}.`);
  }

  function drop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault();
    const rawId = event.dataTransfer.getData(TASK_DRAG_TYPE);
    const task = rawId && tasks.find((item) => String(item.id) === rawId);
    if (task) move(task, status);
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <section className="kanban-section" aria-label="Sticky note Kanban board">
      <div className="kanban-toolbar">
        <div className="kanban-board-label"><StickyNote size={19} /><div><strong>Your task wall</strong><span>{tasks.length} {tasks.length === 1 ? "note" : "notes"} · {doneCount} done</span></div></div>
        <p id="kanban-instructions">Drag a note to move it, or choose its status below.</p>
        <button className="primary-button" type="button" onClick={onAdd}><Plus size={17} /> New task</button>
      </div>
      <p className="kanban-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div className={`kanban-wall${draggingId !== null ? " kanban-dragging" : ""}`}>
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((task) => (task.completed ? "done" : task.status) === column.status);
          return (
            <section
              key={column.status}
              className={`kanban-lane${dropTarget === column.status ? " kanban-lane-over" : ""}`}
              data-status={column.status}
              aria-labelledby={`kanban-${column.status}-heading`}
              style={{ "--lane-accent": column.color } as CSSProperties}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(column.status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => drop(event, column.status)}
            >
              <header className="kanban-lane-heading"><div><span className="kanban-status-dot" /><h2 id={`kanban-${column.status}-heading`}>{column.title}</h2><span className="kanban-lane-count">{columnTasks.length}</span></div><p>{column.caption}</p></header>
              <div className="kanban-notes">
                {columnTasks.map((task) => {
                  const isDone = task.completed || task.status === "done";
                  const subtaskCount = task.subtasks?.length ?? 0;
                  return (
                    <article
                      key={task.id}
                      className={`sticky-note note-${NOTE_COLORS[Math.abs(task.id) % NOTE_COLORS.length]}${isDone ? " note-done" : ""}${draggingId === task.id ? " note-dragging" : ""}`}
                      style={noteStyle(task)}
                      data-task-id={task.id}
                      aria-label={task.title}
                      aria-describedby="kanban-instructions"
                      draggable
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("button, select")) { event.preventDefault(); return; }
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(TASK_DRAG_TYPE, String(task.id));
                        event.dataTransfer.setData("text/plain", task.title);
                        setDraggingId(task.id);
                      }}
                      onDragEnd={() => { setDraggingId(null); setDropTarget(null); }}
                    >
                      <div className="sticky-note-top"><span className="sticky-project" title={task.project}>{task.project || "Personal"}</span><Grip size={16} aria-hidden="true" /></div>
                      <h3><button type="button" onClick={() => onEdit(task)}>{isDone && <Check size={20} aria-hidden="true" />}{task.title}</button></h3>
                      {task.notes && <p className="sticky-note-body">{task.notes}</p>}
                      {!!task.labels?.length && <div className="sticky-labels">{task.labels.map((label) => <span key={label}>#{label}</span>)}</div>}
                      {subtaskCount > 0 && <div className="sticky-subtasks"><Check size={13} /> {task.subtasks?.filter((subtask) => subtask.completed).length}/{subtaskCount} steps complete</div>}
                      <div className="sticky-note-details"><span className={`sticky-priority priority-${task.priority.toLowerCase().replace(/\s/g, "-")}`}><i />{task.priority}</span>{task.due && <span><CalendarDays size={13} />{task.due}</span>}{task.duration > 0 && <span><Clock3 size={13} />{task.duration}m</span>}</div>
                      <footer className="sticky-note-actions">
                        <select aria-label={`Status for ${task.title}`} value={isDone ? "done" : task.status} onChange={(event) => move(task, event.target.value as TaskStatus)}>
                          {COLUMNS.map((item) => <option value={item.status} key={item.status}>{item.title}</option>)}
                        </select>
                        <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit task"><Pencil size={15} /></button>
                        {!isDone && <button type="button" onClick={() => onFocus(task)} aria-label={`Start focus on ${task.title}`} title="Start focus"><Zap size={15} /></button>}
                      </footer>
                    </article>
                  );
                })}
                {!columnTasks.length && <div className="kanban-empty"><StickyNote size={27} strokeWidth={1.3} /><strong>No notes here yet</strong><span>{column.status === "done" ? "Your completed tasks will land here." : "Drop a note here or change its status."}</span>{column.status === "todo" && <button type="button" onClick={onAdd}><Plus size={15} /> Add a task</button>}</div>}
              </div>
            </section>
          );
        })}
      </div>
      <p className="kanban-footer-note">Same tasks, a fresh perspective. Changes appear in your other Orbit views too.</p>
    </section>
  );
}
