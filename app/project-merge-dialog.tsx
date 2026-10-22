"use client";

import { ArrowRight, Merge, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isActionableTask } from "@/lib/task-status";
import { projectMergeError, type Project, type ProjectMergeRequest } from "@/lib/projects";

type Props = {
  projects: Project[];
  tasks: { project: string; completed: boolean; status?: string }[];
  onMerge: (request: ProjectMergeRequest) => string | null;
  onClose: () => void;
};

export function ProjectMergeDialog({ projects, tasks, onMerge, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const review = useRef<HTMLElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [disabledOverride, setDisabledOverride] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (reviewing) review.current?.focus();
  }, [reviewing]);

  const selected = projects.filter((project) => selectedIds.includes(project.id));
  const destination = selected.find((project) => project.id === destinationId);
  const name = nameOverride ?? destination?.name ?? "";
  const disabled = disabledOverride ?? destination?.disabled ?? (selected.length > 0 && selected.every((project) => project.disabled));
  const selectedNames = new Set(selected.map((project) => project.name));
  const combinedTasks = tasks.filter((task) => selectedNames.has(task.project));
  const completedCount = combinedTasks.filter((task) => task.completed && task.status !== "na").length;
  const openCount = combinedTasks.filter(isActionableTask).length;
  const naCount = combinedTasks.filter(task => task.status === "na").length;
  const matches = projects.filter((project) => project.name.toLowerCase().includes(search.trim().toLowerCase()));
  const request: ProjectMergeRequest = { projectIds: selectedIds, destinationId: destinationId === "__new__" ? null : destinationId, name, disabled };

  function selectProject(id: string, checked: boolean) {
    const next = checked ? [...selectedIds, id] : selectedIds.filter((value) => value !== id);
    setSelectedIds(next);
    if (!destinationId || (destinationId !== "__new__" && !next.includes(destinationId))) {
      setDestinationId(next[0] ?? "");
      setNameOverride(null);
      setDisabledOverride(null);
    }
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const validation = projectMergeError(projects, request);
    if (validation) {
      setError(validation);
      setReviewing(false);
      return;
    }
    if (!reviewing) {
      setError("");
      setReviewing(true);
      return;
    }
    const mergeError = onMerge(request);
    if (mergeError) {
      setError(mergeError);
      setReviewing(false);
    }
  }

  return (
    <dialog ref={dialog} className="task-modal project-merge-dialog" aria-labelledby="project-merge-title" onCancel={onClose}>
      <form onSubmit={submit}>
        <div className="modal-header"><div><p className="eyebrow">Bring related work together</p><h2 id="project-merge-title">{reviewing ? "Review project merge" : "Merge projects / priorities"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close project merge"><X size={20} /></button></div>

        {!reviewing ? <>
          <p className="project-merge-intro">Select at least two projects, then choose where their tasks will live.</p>
          <label className="field-label">Find projects<input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects / priorities" /></label>
          <fieldset className="project-merge-sources"><legend>Projects to combine · {selected.length} selected</legend>
            <div className="project-merge-source-list">
              {matches.map((project) => <label className="project-merge-source" key={project.id}>
                <input type="checkbox" checked={selectedIds.includes(project.id)} onChange={(event) => selectProject(project.id, event.target.checked)} aria-label={`Merge ${project.name}`} />
                <span className="project-dot" style={{ background: project.color }} />
                <span className="project-merge-source-copy"><strong>{project.name}</strong><small>{tasks.filter((task) => task.project === project.name).length} tasks · {project.disabled ? "Disabled" : "Active"}</small></span>
              </label>)}
              {matches.length === 0 && <p className="project-merge-intro">No projects match your search.</p>}
            </div>
          </fieldset>
          <div className="form-grid">
            <label className="field-label">Destination<select value={destinationId} disabled={selected.length === 0} onChange={(event) => { setDestinationId(event.target.value); setNameOverride(null); setDisabledOverride(null); setError(""); }}>
              <option value="" disabled>Choose a destination</option>
              {selected.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
              <option value="__new__">Create a new combined project</option>
            </select></label>
            <label className="field-label">Merged project status<select value={disabled ? "disabled" : "active"} onChange={(event) => setDisabledOverride(event.target.value === "disabled")}><option value="active">Active</option><option value="disabled">Disabled</option></select></label>
          </div>
          <label className="field-label">Combined name<input value={name} onChange={(event) => { setNameOverride(event.target.value); setError(""); }} maxLength={80} required placeholder="Name for the combined project / priority" /></label>
          <p className="project-merge-intro">{combinedTasks.length} tasks selected, including {completedCount} completed. Task IDs, dates, attachments, goals, and reporting links are kept.</p>
        </> : <section className="project-merge-review" aria-label="Merge preview" tabIndex={-1} ref={review}>
          <ul>{selected.map((project) => <li key={project.id}><span>{project.name}</span><small>{tasks.filter((task) => task.project === project.name).length} tasks · {project.disabled ? "Disabled" : "Active"}</small></li>)}</ul>
          <ArrowRight size={22} aria-hidden="true" />
          <div className="project-merge-target"><strong>{name.trim()}</strong><span>{combinedTasks.length} tasks · {disabled ? "Disabled" : "Active"}</span><small>{completedCount} completed · {openCount} open{naCount > 0 ? ` · ${naCount} N/A` : ""}</small></div>
          <p>The selected project entries will become this one project. All their tasks and completion history are kept, and the result syncs across your devices.</p>
          {disabled && <p><strong>The destination is disabled.</strong> Its tasks will stay out of active planning until you re-enable it.</p>}
        </section>}

        {error && <p className="project-merge-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          {reviewing && <button className="secondary-button" type="button" onClick={() => setReviewing(false)}>Back</button>}
          <button className="primary-button" type="submit" disabled={selected.length < 2 || !name.trim()}><Merge size={16} />{reviewing ? "Merge projects" : "Review merge"}</button>
        </div>
      </form>
    </dialog>
  );
}
