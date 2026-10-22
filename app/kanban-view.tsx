"use client";

import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, FileText, Grip, ImageIcon, Paperclip, Pencil, Plus, StickyNote, Trash2, X, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type { Task } from "./page";
import { KANBAN_STATUS_LABELS, reorderKanbanColumns, taskColumnId, type KanbanColumn } from "@/lib/kanban";
import { attachmentSize, attachmentUrl, isImageAttachment, MAX_ATTACHMENT_BYTES, MAX_TASK_ATTACHMENTS, type TaskAttachment } from "@/lib/task-attachments";

const NOTE_COLORS = ["butter", "rose", "sky", "mint", "lavender", "peach"];
const NOTE_TILTS = [-1.2, 0.8, -0.6, 1.1, -0.9, 0.5];
const TASK_DRAG_TYPE = "application/x-orbit-kanban-task";
const COLUMN_DRAG_TYPE = "application/x-orbit-kanban-column";

function noteStyle(task: Task): CSSProperties {
  return { "--note-tilt": `${NOTE_TILTS[Math.abs(task.id) % NOTE_TILTS.length]}deg` } as CSSProperties;
}

function KanbanDialog({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="kanban-dialog" aria-labelledby="kanban-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="modal-header"><h2 id="kanban-dialog-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}

function ColumnEditor({ column, columns, taskCount, onClose, onSave }: {
  column: KanbanColumn | "new"; columns: KanbanColumn[]; taskCount: number; onClose: () => void;
  onSave: (columns: KanbanColumn[], transferTo?: string) => void;
}) {
  const existing = column !== "new";
  const [draft, setDraft] = useState<KanbanColumn>(() => existing ? column : { id: `column-${crypto.randomUUID()}`, title: "", description: "", color: "#8f5dff", status: "todo" });
  const [deleting, setDeleting] = useState(false);
  const alternatives = columns.filter(c => c.id !== draft.id);
  const [destination, setDestination] = useState(alternatives[0]?.id ?? "");
  return <KanbanDialog title={deleting ? "Delete column" : existing ? "Edit column" : "Add column"} onClose={onClose}>
    {deleting ? <form onSubmit={event => { event.preventDefault(); onSave(alternatives, destination); onClose(); }}>
      <p className="kanban-dialog-copy">Delete “{draft.title}” and move all {taskCount} {taskCount === 1 ? "task" : "tasks"} to the column below. Tasks hidden by filters are included.</p>
      <label className="field-label">Move tasks to<select aria-label="Move tasks to" value={destination} onChange={e => setDestination(e.target.value)}>{alternatives.map(c => <option key={c.id} value={c.id}>{c.title} · {KANBAN_STATUS_LABELS[c.status]}</option>)}</select></label>
      <p className="kanban-dialog-copy">Tasks will use the destination’s behavior. A Done destination completes them; an open destination reopens completed tasks. N/A keeps them outside planned work without recording completion.</p>
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setDeleting(false)}>Back</button><span /><button className="primary-button kanban-danger" type="submit" disabled={!destination}>Delete & move tasks</button></div>
    </form> : <form onSubmit={event => { event.preventDefault(); if (!draft.title.trim()) return; onSave(existing ? columns.map(c => c.id === draft.id ? { ...draft, title: draft.title.trim() } : c) : [...columns, { ...draft, title: draft.title.trim() }]); onClose(); }}>
      <label className="field-label">Column name<input autoFocus required maxLength={80} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder="For example, Review" /></label>
      <label className="field-label">Description<textarea rows={2} maxLength={300} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What belongs in this column?" /></label>
      <div className="form-grid"><label className="field-label">Column color<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} /></label>
        <label className="field-label">Task behavior<select aria-label="Task behavior" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as KanbanColumn["status"] })}>{Object.entries(KANBAN_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <p className="kanban-dialog-copy">Behavior keeps tasks connected to Orbit’s other views. N/A retains tasks without adding completions or recurring occurrences. Choosing Done records completion and creates the next occurrence of recurring tasks.{existing && taskCount > 0 ? ` Changing behavior updates all ${taskCount} tasks in this column.` : ""}</p>
      <div className="modal-actions">{existing && <button className="delete-button" type="button" disabled={columns.length === 1} onClick={() => setDeleting(true)}><Trash2 size={15} />Delete column</button>}<span /><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{existing ? "Save column" : "Create column"}</button></div>
      {existing && columns.length === 1 && <p className="kanban-dialog-copy">Keep at least one column on your board.</p>}
    </form>}
  </KanbanDialog>;
}

function AttachmentEditor({ task, onClose, onChange }: { task: Task; onClose: () => void; onChange: (attachments: TaskAttachment[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const attachments = task.attachments ?? [];

  async function upload(files: File[]) {
    if (busy || !files.length) return;
    if (files.length + attachments.length > MAX_TASK_ATTACHMENTS) { setError("You can attach up to 20 files to a task."); return; }
    if (files.some(file => file.size > MAX_ATTACHMENT_BYTES || !file.size)) { setError("Choose non-empty files, each 3 MB or smaller."); return; }
    setBusy(true); setError("");
    let next = [...attachments];
    try {
      for (const file of files) {
        const form = new FormData(); form.set("file", file);
        const response = await fetch("/api/attachments", { method: "POST", body: form });
        const body = await response.json();
        if (!response.ok || !body.attachment) throw new Error(body.error || "Upload failed. Please try again.");
        next = [...next, body.attachment as TaskAttachment];
        onChange(next);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed. Please try again."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }

  return <KanbanDialog title="Images & files" onClose={onClose} busy={busy}>
    <p className="kanban-dialog-copy">{task.title}</p>
    <div className="attachment-dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }} onPaste={e => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void upload(files); } }} tabIndex={0}>
      <ImageIcon size={26} /><strong>{busy ? "Uploading your files…" : "Add images or attach files"}</strong><span>Drop files here, paste an image, or choose files. Up to 20 files · 3 MB each.</span>
      <input ref={input} type="file" multiple className="kanban-sr-only" aria-label="Choose images or files" disabled={busy} onChange={e => void upload(Array.from(e.target.files ?? []))} />
      <button className="secondary-button" type="button" disabled={busy || attachments.length >= MAX_TASK_ATTACHMENTS} onClick={() => input.current?.click()}><Paperclip size={16} />Choose files</button>
    </div>
    {error && <p role="alert" className="attachment-error">{error}</p>}
    <div className="attachment-list">{attachments.map(attachment => <article key={attachment.id} className="attachment-row">
      {isImageAttachment(attachment) ? <a className="attachment-preview" href={attachmentUrl(attachment)} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${attachment.name}`}><img src={attachmentUrl(attachment)} alt={attachment.name} loading="lazy" /></a> : <span className="attachment-file-icon"><FileText size={23} /></span>}
      <div><strong>{attachment.name}</strong><span>{attachmentSize(attachment.size)}</span></div>
      <a className="icon-button" href={attachmentUrl(attachment, true)} download={attachment.name} aria-label={`Download ${attachment.name}`}><Download size={18} /></a>
      <button type="button" className="icon-button" aria-label={`Remove ${attachment.name} from task`} disabled={busy} onClick={() => onChange(attachments.filter(item => item.id !== attachment.id))}><Trash2 size={17} /></button>
    </article>)}</div>
    <div className="modal-actions"><span /><button className="primary-button" type="button" disabled={busy} onClick={onClose}>Done</button></div>
  </KanbanDialog>;
}

export function KanbanView({ tasks, allTasks, columns, onColumnsChange, onAdd, onMove, onEdit, onFocus, onAttachmentsChange }: {
  tasks: Task[];
  allTasks: Task[];
  columns: KanbanColumn[];
  onColumnsChange: (columns: KanbanColumn[], transferTo?: string) => void;
  onAdd: () => void;
  onMove: (id: number, columnId: string) => void;
  onEdit: (task: Task) => void;
  onFocus: (task: Task) => void;
  onAttachmentsChange: (id: number, attachments: TaskAttachment[]) => void;
}) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<KanbanColumn | "new" | null>(null);
  const [attachmentTaskId, setAttachmentTaskId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const attachmentTask = allTasks.find(task => task.id === attachmentTaskId);
  const doneCount = tasks.filter((task) => task.completed || task.status === "done").length;

  function move(task: Task, columnId: string) {
    if (taskColumnId(task, columns) === columnId) return;
    onMove(task.id, columnId);
    setAnnouncement(`${task.title} moved to ${columns.find(column => column.id === columnId)?.title}.`);
  }

  function reorder(sourceId: string, targetId: string) {
    const next = reorderKanbanColumns(columns, sourceId, targetId);
    if (next !== columns) {
      onColumnsChange(next);
      setAnnouncement(`${columns.find(c => c.id === sourceId)?.title} moved to position ${next.findIndex(c => c.id === sourceId) + 1}.`);
    }
  }

  function drop(event: DragEvent<HTMLElement>, columnId: string) {
    event.preventDefault();
    const sourceColumn = event.dataTransfer.getData(COLUMN_DRAG_TYPE);
    if (sourceColumn) reorder(sourceColumn, columnId);
    const rawId = event.dataTransfer.getData(TASK_DRAG_TYPE);
    const task = rawId && tasks.find((item) => String(item.id) === rawId);
    if (task) move(task, columnId);
    setDraggingId(null);
    setDraggingColumn(null);
    setDropTarget(null);
  }

  return (
    <section className="kanban-section" aria-label="Sticky note Kanban board">
      <div className="kanban-toolbar">
        <div className="kanban-board-label"><StickyNote size={19} /><div><strong>Your task wall</strong><span>{tasks.length} {tasks.length === 1 ? "note" : "notes"} · {doneCount} done</span></div></div>
        <p id="kanban-instructions">Drag notes to move tasks. Drag column grips to reorder.</p>
        <button className="secondary-button" type="button" onClick={() => setEditingColumn("new")} disabled={columns.length >= 31}><Plus size={17} /> Add column</button>
        <button className="primary-button" type="button" onClick={onAdd}><Plus size={17} /> New task</button>
      </div>
      <p className="kanban-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <div className={`kanban-wall${draggingId !== null ? " kanban-dragging" : ""}`} style={{ "--column-count": columns.length } as CSSProperties}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(COLUMN_DRAG_TYPE) && !event.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
          const wall = event.currentTarget;
          const bounds = wall.getBoundingClientRect();
          const direction = event.clientX < bounds.left + 64 ? -1 : event.clientX > bounds.right - 64 ? 1 : 0;
          if (direction) wall.scrollBy({ left: direction * 18 });
        }}>
        {columns.map((column, index) => {
          const columnTasks = tasks.filter(task => taskColumnId(task, columns) === column.id);
          return (
            <section
              key={column.id}
              className={`kanban-lane${dropTarget === column.id ? " kanban-lane-over" : ""}${draggingColumn === column.id ? " kanban-column-dragging" : ""}`}
              data-status={column.status}
              data-column-id={column.id}
              aria-labelledby={`kanban-${column.id}-heading`}
              style={{ "--lane-accent": column.color } as CSSProperties}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(TASK_DRAG_TYPE) && !event.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDropTarget(column.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={(event) => drop(event, column.id)}
            >
              <header className="kanban-lane-heading">
                <div><button type="button" className="kanban-grip" aria-label={`Drag ${column.title} column to reorder`} title="Drag to reorder column" draggable
                  onDragStart={event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(COLUMN_DRAG_TYPE, column.id); setDraggingColumn(column.id); }}
                  onDragEnd={() => { setDraggingColumn(null); setDropTarget(null); }}><Grip size={16} /></button>
                  <span className="kanban-status-dot" /><h2 id={`kanban-${column.id}-heading`}>{column.title}</h2><span className="kanban-lane-count">{columnTasks.length}</span></div>
                <p>{column.description}</p>
                <div className="kanban-column-tools">
                  <span>{KANBAN_STATUS_LABELS[column.status]}</span>
                  <button type="button" aria-label={`Move ${column.title} column left`} disabled={index === 0} onClick={() => reorder(column.id, columns[index - 1].id)}><ChevronLeft size={15} /></button>
                  <button type="button" aria-label={`Move ${column.title} column right`} disabled={index === columns.length - 1} onClick={() => reorder(column.id, columns[index + 1].id)}><ChevronRight size={15} /></button>
                  <button type="button" aria-label={`Edit ${column.title} column`} onClick={() => setEditingColumn(column)}><Pencil size={14} /></button>
                </div>
              </header>
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
                      {!!task.attachments?.length && <div className="sticky-attachments">
                        <div className="sticky-images">{task.attachments.filter(isImageAttachment).slice(0, 2).map(attachment => <button type="button" key={attachment.id} onClick={() => setAttachmentTaskId(task.id)} aria-label={`View image ${attachment.name}`}><img src={attachmentUrl(attachment)} alt={attachment.name} loading="lazy" /></button>)}</div>
                        <button className="sticky-file-count" type="button" onClick={() => setAttachmentTaskId(task.id)}><Paperclip size={13} />{task.attachments.length} {task.attachments.length === 1 ? "attachment" : "attachments"}</button>
                      </div>}
                      {!!task.labels?.length && <div className="sticky-labels">{task.labels.map((label) => <span key={label}>#{label}</span>)}</div>}
                      {subtaskCount > 0 && <div className="sticky-subtasks"><Check size={13} /> {task.subtasks?.filter((subtask) => subtask.completed).length}/{subtaskCount} steps complete</div>}
                      <div className="sticky-note-details"><span className={`sticky-priority priority-${task.priority.toLowerCase().replace(/\s/g, "-")}`}><i />{task.priority}</span>{task.due && <span><CalendarDays size={13} />{task.due}</span>}{task.duration > 0 && <span><Clock3 size={13} />{task.duration}m</span>}</div>
                      <footer className="sticky-note-actions">
                        <select aria-label={`Status for ${task.title}`} value={column.id} onChange={(event) => move(task, event.target.value)}>
                          {columns.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
                        </select>
                        <button type="button" onClick={() => setAttachmentTaskId(task.id)} aria-label={`Add images or files to ${task.title}`} title="Images & files"><Paperclip size={15} /></button>
                        <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit task"><Pencil size={15} /></button>
                        {!isDone && task.status !== "na" && <button type="button" onClick={() => onFocus(task)} aria-label={`Start focus on ${task.title}`} title="Start focus"><Zap size={15} /></button>}
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
      {editingColumn && <ColumnEditor key={editingColumn === "new" ? "new" : editingColumn.id} column={editingColumn} columns={columns} taskCount={editingColumn === "new" ? 0 : allTasks.filter(task => taskColumnId(task, columns) === editingColumn.id).length} onClose={() => setEditingColumn(null)} onSave={onColumnsChange} />}
      {attachmentTask && <AttachmentEditor task={attachmentTask} onClose={() => setAttachmentTaskId(null)} onChange={attachments => onAttachmentsChange(attachmentTask.id, attachments)} />}
    </section>
  );
}
