"use client";

import { ChevronLeft, ChevronRight, Orbit, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { moveProgressPeriod, progressDateLabel, progressProjects, progressToday, progressWindow, shiftProgressDay, PROGRESS_TIME_ZONE, type ProgressPeriod } from "@/lib/project-progress";
import { projectCategoryNames, type Project } from "@/lib/projects";
import { buildInboxOrbits } from "@/lib/inbox-orbits";
import { ProjectProgressOrbit } from "./project-progress-orbit";
import type { Task } from "./page";

export function InboxOrbitPanel({ tasks, projects, onOpenProgress }: { tasks: Task[]; projects: Project[]; onOpenProgress: () => void }) {
  const [period, setPeriod] = useState<ProgressPeriod | "all">("all");
  const [anchor, setAnchor] = useState(progressToday);
  const [rangeEnd, setRangeEnd] = useState(progressToday);
  const [category, setCategory] = useState("");
  const today = progressToday();
  const choices = useMemo(() => progressProjects(tasks, projects), [tasks, projects]);
  const names = projectCategoryNames(choices);
  const selectedCategory = names.includes(category) ? category : "";
  const completionWindow = useMemo(() => period === "all" ? undefined : progressWindow(anchor, period, rangeEnd), [period, anchor, rangeEnd]);
  const orbits = useMemo(() => buildInboxOrbits(tasks, projects, { category: selectedCategory, completionWindow, today }), [tasks, projects, selectedCategory, completionWindow, today]);
  const periodTitle = !completionWindow ? "All completion dates" : completionWindow.start === completionWindow.end ? progressDateLabel(completionWindow.start, { month: "short", day: "numeric", year: "numeric" }) : `${progressDateLabel(completionWindow.start)} – ${progressDateLabel(completionWindow.end, { month: "short", day: "numeric", year: "numeric" })}`;

  function movePeriod(step: number) {
    if (period === "all") return;
    const next = moveProgressPeriod(anchor, period, step, rangeEnd);
    if (period === "range") setRangeEnd(shiftProgressDay(rangeEnd, Math.round((Date.parse(next) - Date.parse(anchor)) / 86_400_000)));
    else if (next > rangeEnd) setRangeEnd(next);
    setAnchor(next);
  }

  return <aside className="inbox-orbit-panel" aria-label="Inbox circular orbit">
    <header className="inbox-orbit-heading"><div><Orbit size={18} /><h2>Circular Orbits</h2></div><button type="button" className="icon-button" aria-label="Open full project progress" title="Open full project progress" onClick={onOpenProgress}><TrendingUp size={17} /></button></header>
    <p className="inbox-orbit-intro">See where Not Started, In Progress and Complete tasks gravitate.</p>
    <div className="inbox-orbit-controls">
      <label>Complete period<select aria-label="Inbox orbit period" value={period} onChange={event => setPeriod(event.target.value as ProgressPeriod | "all")}><option value="all">All time</option><option value="day">Day</option><option value="range">Date range</option><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
      {period !== "all" && <label>{period === "range" ? "Start date" : "Reference date"}<input type="date" aria-label="Inbox orbit reference date" value={anchor} onChange={event => { const value = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { setAnchor(value); if (value > rangeEnd) setRangeEnd(value); } }} /></label>}
      {period === "range" && <label>End date<input type="date" aria-label="Inbox orbit end date" min={anchor} value={rangeEnd} onChange={event => { const value = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= anchor) setRangeEnd(value); }} /></label>}
      <label className="inbox-orbit-category">Parent category<select aria-label="Inbox orbit parent category" value={selectedCategory} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{names.map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    {period !== "all" && <div className="inbox-orbit-navigation"><button type="button" className="icon-button" aria-label="Previous inbox orbit period" onClick={() => movePeriod(-1)}><ChevronLeft size={16} /></button><span aria-live="polite">{periodTitle}</span><button type="button" className="icon-button" aria-label="Next inbox orbit period" onClick={() => movePeriod(1)}><ChevronRight size={16} /></button><button type="button" className="secondary-button" onClick={() => { setAnchor(today); if (period === "range" || rangeEnd < today) setRangeEnd(today); }}>Today</button></div>}
    {selectedCategory && <button type="button" className="inbox-orbit-reset" onClick={() => setCategory("")}>Show all categories</button>}
    <p className="inbox-orbit-scope">Open statuses show current task state. Complete: {periodTitle}. Inbox search, priority, project, due and label filters apply to all three.</p>
    {orbits.map(orbit => <section className="inbox-status-orbit" key={orbit.value} aria-label={`${orbit.label} task orbit`}>
      <ProjectProgressOrbit categories={orbit.categories} periodTitle={orbit.value === "done" ? periodTitle : "Current workspace"} onSelectCategory={setCategory} compact statusLabel={orbit.label} />
    </section>)}
    <p className="inbox-orbit-timezone">N/A tasks are excluded. Completion-date filters use {PROGRESS_TIME_ZONE}; All time includes undated completed tasks.</p>
  </aside>;
}
