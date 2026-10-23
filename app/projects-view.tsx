"use client";

import { ArrowRight, Folder, FolderTree, LayoutGrid, Merge, Pause, Pencil, Play, Plus, Rows3, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { groupProjectsByCategory, projectCategory, projectCategoryNames, type Project } from "@/lib/projects";
import { isActionableTask } from "@/lib/task-status";
import type { Task } from "./page";

const BUNDLE_COLORS = ["#2457ff", "#8256d0", "#11826a", "#a66a13", "#bf5279", "#087e9d", "#967135", "#7153a8", "#596779"];

type Props = { tasks: Task[]; projects: Project[]; onCreateProject: () => void; onOpenProject: (project: Project) => void; onRenameProject: (project: Project) => void; onDeleteProject: (project: Project) => void; onToggleProject: (project: Project) => void; onMergeProjects: () => void; onViewProgress: () => void; onManageCategories: () => void };

export function ProjectsView({ tasks, projects, onCreateProject, onOpenProject, onRenameProject, onDeleteProject, onToggleProject, onMergeProjects, onViewProgress, onManageCategories }: Props) {
  const [layout, setLayout] = useState<"bundles" | "list" | "grid">("bundles");
  const [status, setStatus] = useState<"all" | "active" | "disabled">("all");
  const [category, setCategory] = useState("");
  const categories = projectCategoryNames(projects);
  const currentCategory = categories.includes(category) ? category : "";
  const activeCount = projects.filter(project => !project.disabled).length;
  const disabledCount = projects.length - activeCount;
  const statusFilters = [{ value: "all", label: "All", count: projects.length }, { value: "active", label: "Active", count: activeCount }, { value: "disabled", label: "Disabled", count: disabledCount }] as const;
  const projectStats = projects.filter(project => (!currentCategory || projectCategory(project) === currentCategory) && (status === "all" || (status === "disabled" ? project.disabled : !project.disabled))).map(project => {
    const projectTasks = tasks.filter(task => task.project === project.name);
    const applicable = projectTasks.filter(task => task.status !== "na");
    const completed = applicable.filter(task => task.completed).length;
    return { ...project, taskCount: projectTasks.length, applicableCount: applicable.length, completedCount: completed, openCount: projectTasks.filter(isActionableTask).length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 };
  });
  const groups = groupProjectsByCategory(projectStats);

  function lifecycle(project: Project) { onToggleProject(project); if (status !== "all") setStatus("all"); }

  return <div className="projects-view">
    <div className="projects-toolbar"><div><p className="eyebrow">Portfolio overview</p><h2>{categories.length} parent categories</h2><p className="project-category-overview">{activeCount} active · {disabledCount} disabled projects / priorities</p></div><div className="projects-toolbar-actions">
      <button className="secondary-button" type="button" onClick={onManageCategories}><Folder size={16} /> Parent categories</button>
      <button className="secondary-button" type="button" onClick={onViewProgress}><TrendingUp size={16} /> View progress</button>
      <button className="secondary-button" type="button" onClick={onMergeProjects} disabled={projects.length < 2}><Merge size={16} /> Merge projects</button>
      <button className="primary-button" type="button" onClick={onCreateProject}><Plus size={16} /> New project</button>
      <div className="project-view-switch" role="group" aria-label="Project layout"><button type="button" className={layout === "bundles" ? "active" : ""} onClick={() => setLayout("bundles")} aria-pressed={layout === "bundles"}><FolderTree size={16} /> Bundles</button><button type="button" className={layout === "list" ? "active" : ""} onClick={() => setLayout("list")} aria-pressed={layout === "list"}><Rows3 size={16} /> List</button><button type="button" className={layout === "grid" ? "active" : ""} onClick={() => setLayout("grid")} aria-pressed={layout === "grid"}><LayoutGrid size={16} /> Grid</button></div>
    </div></div>
    <div className="project-status-toolbar"><div className="project-view-switch" role="group" aria-label="Project status">{statusFilters.map(filter => <button key={filter.value} type="button" className={status === filter.value ? "active" : ""} aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)}>{filter.label} ({filter.count})</button>)}</div><label className="project-category-filter">Parent category<select aria-label="Filter by parent category" value={currentCategory} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label><p>Disabled projects keep every task and stay out of active planning.</p></div>
    <div className="project-bundle-intro"><p><FolderTree size={17} /> Projects are bundled under their parent category.</p>{currentCategory && <button type="button" onClick={() => { setCategory(""); setLayout("bundles"); }}>All category bundles <ArrowRight size={14} /></button>}</div>
    {!projectStats.length && <div className="empty-list"><Folder size={30} /><h3>No projects match these filters</h3><p>Choose another parent category or project status.</p></div>}
    <div className={layout === "bundles" ? "project-category-bundles" : "project-category-groups"}>{groups.map(group => {
      const openCount = group.projects.reduce((sum, project) => sum + project.openCount, 0);
      const total = group.projects.reduce((sum, project) => sum + project.applicableCount, 0);
      const done = group.projects.reduce((sum, project) => sum + project.completedCount, 0);
      const color = BUNDLE_COLORS[categories.indexOf(group.name) % BUNDLE_COLORS.length];
      const disabled = group.projects.filter(project => project.disabled).length;
      const taskCount = group.projects.reduce((sum, project) => sum + project.taskCount, 0);
      return layout === "bundles" ? <section className="project-category-bundle" key={group.name} aria-label={`${group.name} category bundle`} style={{ borderTopColor: color }}>
        <header className="category-bundle-heading"><span className="category-bundle-icon" style={{ color, background: `${color}12` }}><FolderTree size={23} /></span><div><h3>{group.name}</h3><p>{group.projects.length} {group.projects.length === 1 ? "project / priority" : "projects / priorities"}{disabled > 0 ? ` · ${disabled} disabled` : ""}</p></div></header>
        <div className="category-bundle-summary"><span>{openCount} open tasks · {taskCount} total tasks</span><strong>{total ? `${Math.round(done / total * 100)}%` : "—"}</strong></div>
        <div className="category-bundle-meter" aria-label={total ? `${Math.round(done / total * 100)}% of applicable tasks complete` : "No applicable tasks"}><span style={{ width: `${total ? done / total * 100 : 0}%`, background: color }} /></div>
        <ul className="category-bundle-projects">{group.projects.map(project => <li className={project.disabled ? "bundle-child disabled" : "bundle-child"} key={project.id}>
          <button className="bundle-child-open" type="button" onClick={() => onOpenProject(project)} aria-label={`Open ${project.name}`}><span className="project-dot" style={{ background: project.color }} /><span><strong>{project.name}</strong><small>{project.disabled ? "Disabled · " : ""}{project.openCount} open · {project.taskCount} tasks</small></span><ArrowRight size={15} /></button>
          <button type="button" className="bundle-child-edit" onClick={() => onRenameProject(project)} aria-label={`Edit ${project.name}`} title="Edit project and parent category"><Pencil size={14} /></button>
        </li>)}</ul>
        <button className="category-bundle-details" type="button" onClick={() => { setCategory(group.name); setLayout("list"); }} aria-label={`View ${group.name} category details`}>View category details <ArrowRight size={15} /></button>
      </section> : <details className="project-category-group" open key={group.name}>
        <summary><span className="category-group-title"><Folder size={20} /><span><strong>{group.name}</strong><small>{group.projects.length} {group.projects.length === 1 ? "project / priority" : "projects / priorities"} · {openCount} open tasks</small></span></span><span className="category-group-progress">{total ? `${Math.round(done / total * 100)}% complete` : "No applicable tasks"}</span></summary>
        {layout === "list" ? <section className="project-list" aria-label={`${group.name} projects list`}>{group.projects.map(project => <article className={`project-list-row${project.disabled ? " project-disabled" : ""}`} key={project.id}>
          <button className="project-list-main" type="button" onClick={() => onOpenProject(project)}><span className="project-list-icon" style={{ background: `${project.color}18`, color: project.color }}><Folder size={20} /></span><span className="project-list-copy"><strong>{project.name}</strong><small>{project.description}</small><span className={`project-status-badge${project.disabled ? " disabled" : ""}`}>{project.disabled ? "Disabled" : "Active"}</span></span></button>
          <div className="project-list-metrics"><span><strong>{project.openCount}</strong><small>Open</small></span><span><strong>{project.taskCount}</strong><small>Total</small></span></div>
          <div className="project-list-progress"><div><span>Progress</span><strong>{project.percent}%</strong></div><i><span style={{ width: `${project.percent}%`, background: project.color }} /></i></div>
          <div className="project-list-actions"><button className="project-lifecycle-button" type="button" onClick={() => lifecycle(project)} aria-label={`${project.disabled ? "Re-enable" : "Disable"} ${project.name}`}>{project.disabled ? <Play size={13} /> : <Pause size={13} />}{project.disabled ? "Re-enable" : "Disable"}</button><button className="project-list-delete" type="button" onClick={() => onDeleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 size={16} /></button><button className="project-list-edit" type="button" onClick={() => onRenameProject(project)} aria-label={`Edit ${project.name}`} title="Edit name and parent category"><Pencil size={16} /></button><button className="project-list-open" type="button" onClick={() => onOpenProject(project)} aria-label={`Open ${project.name}`}><ArrowRight size={17} /></button></div>
        </article>)}</section> : <section className="project-grid" aria-label={`${group.name} projects grid`}>{group.projects.map(project => <article className={`project-card${project.disabled ? " project-disabled" : ""}`} key={project.id}>
          <div className="project-card-top"><span className="project-symbol"><Folder size={21} /></span><div className="project-card-actions"><button className="project-card-delete" type="button" onClick={() => onDeleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 size={17} /></button><button type="button" onClick={() => onRenameProject(project)} aria-label={`Edit ${project.name}`}><Pencil size={18} /></button></div></div>
          <p className="eyebrow">{project.taskCount} tasks</p><span className={`project-status-badge${project.disabled ? " disabled" : ""}`}>{project.disabled ? "Disabled" : "Active"}</span><h2>{project.name}</h2><p>{project.description}</p>
          <div className="project-progress"><div><span>Progress</span><strong>{project.percent}%</strong></div><i><span style={{ width: `${project.percent}%`, background: project.color }} /></i></div><button className="project-open" type="button" onClick={() => onOpenProject(project)}>Open project <ArrowRight size={16} /></button><button className="project-lifecycle-button" type="button" onClick={() => lifecycle(project)} aria-label={`${project.disabled ? "Re-enable" : "Disable"} ${project.name}`}>{project.disabled ? <Play size={14} /> : <Pause size={14} />}{project.disabled ? "Re-enable" : "Disable"}</button>
        </article>)}</section>}
      </details>;
    })}</div>
  </div>;
}
