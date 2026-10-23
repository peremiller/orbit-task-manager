"use client";

import { Folder, Save, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PROJECT_CATEGORIES, projectCategory, type Project, type ProjectCategoryAssignment } from "@/lib/projects";

export function ProjectCategoriesDialog({ projects, onSave, onClose }: { projects: Project[]; onSave: (assignments: ProjectCategoryAssignment[]) => string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [assignments, setAssignments] = useState(() => projects.map(project => ({ projectId: project.id, category: projectCategory(project) })));
  const [search, setSearch] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [error, setError] = useState("");
  const categories = [...new Set(assignments.map(item => item.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categoryToRename = categories.includes(renameFrom) ? renameFrom : categories[0] ?? "";
  const choices = [...new Set([...PROJECT_CATEGORIES, ...categories, "Other Priorities", "Uncategorized"])];
  const matching = projects.filter(project => assignments.some(item => item.projectId === project.id) && `${project.name} ${assignments.find(item => item.projectId === project.id)?.category}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  function renameCategory() {
    const category = renameTo.trim().replace(/\s+/g, " ");
    if (!category || category.length > 60) { setError("Enter a category name of 1–60 characters."); return; }
    setAssignments(current => current.map(item => item.category.trim().replace(/\s+/g, " ").toLowerCase() === categoryToRename.toLowerCase() ? { ...item, category } : item));
    setRenameFrom(category);
    setRenameTo("");
    setError("");
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (assignments.some(item => !item.category.trim() || item.category.trim().length > 60)) { setError("Every project needs a category. Use Uncategorized to leave a project outside the themes."); return; }
    const message = onSave(assignments);
    if (message) setError(message);
  }

  return <dialog ref={dialog} className="task-modal project-categories-dialog" aria-labelledby="project-categories-title" onCancel={onClose}>
    <form onSubmit={save}>
      <div className="modal-header"><div><p className="eyebrow">Organize by theme</p><h2 id="project-categories-title">Parent categories</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close parent categories"><X size={20} /></button></div>
      <p className="category-dialog-intro">Choose a category for each project, or type a new theme. Categories sync across your devices. Project names, tasks, and history stay with their projects.</p>
      <div className="category-rename-controls"><label className="field-label">Rename a category<select value={categoryToRename} onChange={event => setRenameFrom(event.target.value)}>{categories.map(name => <option key={name}>{name}</option>)}</select></label><label className="field-label">New category name<input value={renameTo} onChange={event => setRenameTo(event.target.value)} maxLength={60} placeholder="Enter a new name" /></label><button type="button" className="secondary-button" onClick={renameCategory} disabled={!renameTo.trim() || !categoryToRename}>Rename category</button></div>
      <label className="field-label">Find a project or category<input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects or themes" /></label>
      <datalist id="category-manager-choices">{choices.map(name => <option value={name} key={name} />)}</datalist>
      <div className="category-assignment-list" aria-label="Project category assignments">
        {matching.map(project => <label className="category-assignment-row" key={project.id}><span><Folder size={17} style={{ color: project.color }} /><span><strong>{project.name}</strong><small>{project.disabled ? "Disabled" : "Active"}</small></span></span><input list="category-manager-choices" aria-label={`Parent category for ${project.name}`} maxLength={60} value={assignments.find(item => item.projectId === project.id)?.category ?? ""} onChange={event => { const category = event.target.value; setAssignments(current => current.map(item => item.projectId === project.id ? { ...item, category } : item)); setError(""); }} /></label>)}
        {!matching.length && <p className="category-dialog-intro">No projects match this search.</p>}
      </div>
      <p className="category-dialog-intro">{categories.length} categories · {assignments.length} projects / priorities. A new category is kept when at least one project uses it.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button"><Save size={16} /> Save categories</button></div>
    </form>
  </dialog>;
}
