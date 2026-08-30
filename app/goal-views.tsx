"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDot, Clock3, Edit3, Folder, Network, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import type { Goal } from "@/lib/goals";

type GoalTask = {
  id: number;
  title: string;
  project: string;
  due: string;
  duration: number;
  priority: "Very High" | "High" | "Medium" | "Low";
  completed: boolean;
  goalId?: string;
};

function formatTargetDate(value: string) {
  if (!value) return "No target date";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function taskWeight(priority: GoalTask["priority"]) {
  return priority === "Very High" ? "xl" : priority === "High" ? "lg" : priority === "Medium" ? "md" : "sm";
}

export function GoalsView({ goals, tasks, onCreateGoal, onEditGoal, onDeleteGoal, onAddTask, onEditTask }: {
  goals: Goal[];
  tasks: GoalTask[];
  onCreateGoal: () => void;
  onEditGoal: (goal: Goal) => void;
  onDeleteGoal: (goal: Goal) => void;
  onAddTask: (goalId: string) => void;
  onEditTask: (taskId: number) => void;
}) {
  const alignedTasks = tasks.filter((task) => task.goalId && goals.some((goal) => goal.id === task.goalId));
  const completedAligned = alignedTasks.filter((task) => task.completed).length;
  const alignment = tasks.length ? Math.round((alignedTasks.length / tasks.length) * 100) : 0;

  return (
    <div className="goals-view">
      <section className="goal-summary-grid" aria-label="Goal alignment summary">
        <article><span className="goal-stat-icon blue"><Target size={21} /></span><div><strong>{goals.length}</strong><small>active goals</small></div></article>
        <article><span className="goal-stat-icon violet"><Network size={21} /></span><div><strong>{alignment}%</strong><small>tasks aligned</small></div></article>
        <article><span className="goal-stat-icon green"><CheckCircle2 size={21} /></span><div><strong>{completedAligned}</strong><small>aligned tasks done</small></div></article>
      </section>

      {goals.length ? (
        <section className="goal-card-grid" aria-label="Your goals">
          {goals.map((goal) => {
            const goalTasks = tasks.filter((task) => task.goalId === goal.id);
            const completed = goalTasks.filter((task) => task.completed).length;
            const progress = goalTasks.length ? Math.round((completed / goalTasks.length) * 100) : 0;
            const openTasks = goalTasks.filter((task) => !task.completed);
            return (
              <article className="goal-card" key={goal.id} style={{ "--goal-color": goal.color } as CSSProperties}>
                <div className="goal-card-accent" />
                <header>
                  <span className="goal-orbit"><Target size={19} /></span>
                  <div><h2>{goal.title}</h2><p>{goal.description || "A clear outcome for the work that matters."}</p></div>
                  <div className="goal-card-actions">
                    <button type="button" onClick={() => onEditGoal(goal)} aria-label={`Edit ${goal.title}`}><Edit3 size={16} /></button>
                    <button className="danger" type="button" onClick={() => onDeleteGoal(goal)} aria-label={`Delete ${goal.title}`}><Trash2 size={16} /></button>
                  </div>
                </header>
                <div className="goal-meta-row">
                  <span><CalendarDays size={14} />{formatTargetDate(goal.targetDate)}</span>
                  <span><CircleDot size={14} />{openTasks.length} open</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="goal-progress" aria-label={`${goal.title} is ${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
                <div className="goal-task-preview">
                  {openTasks.length ? openTasks.slice(0, 4).map((task) => (
                    <button type="button" key={task.id} onClick={() => onEditTask(task.id)}>
                      <span className={`goal-priority-dot priority-${task.priority.toLowerCase().replaceAll(" ", "-")}`} />
                      <span><strong>{task.title}</strong><small>{task.project} · {task.due}</small></span>
                      <ArrowRight size={14} />
                    </button>
                  )) : <div className="goal-no-tasks"><CheckCircle2 size={18} /><span>{goalTasks.length ? "Every linked task is complete." : "Link a task to begin moving this goal."}</span></div>}
                  {openTasks.length > 4 && <small className="goal-more-tasks">+{openTasks.length - 4} more open tasks</small>}
                </div>
                <button className="goal-add-task" type="button" onClick={() => onAddTask(goal.id)}><Plus size={15} /> Add an aligned task</button>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="goals-empty">
          <span><Target size={30} /></span>
          <p className="eyebrow">Give every task a reason</p>
          <h2>Create your first goal</h2>
          <p>Goals connect daily work to the outcomes you want to achieve. You can align any task now or later.</p>
          <button className="primary-button" type="button" onClick={onCreateGoal}><Plus size={17} /> New goal</button>
        </section>
      )}

      {goals.length > 0 && tasks.length > alignedTasks.length && (
        <section className="unaligned-callout">
          <span><Sparkles size={20} /></span>
          <div><strong>{tasks.length - alignedTasks.length} tasks are not aligned yet</strong><p>Edit a task and choose a goal to make your plan more intentional.</p></div>
        </section>
      )}
    </div>
  );
}

export function MindMapView({ goals, tasks, onEditTask, onCreateGoal }: {
  goals: Goal[];
  tasks: GoalTask[];
  onEditTask: (taskId: number) => void;
  onCreateGoal: () => void;
}) {
  const [mode, setMode] = useState<"mind" | "words">("mind");
  const openTasks = useMemo(() => tasks.filter((task) => !task.completed), [tasks]);
  const branches = useMemo(() => {
    const aligned = goals.map((goal) => ({ goal, tasks: openTasks.filter((task) => task.goalId === goal.id) })).filter((branch) => branch.tasks.length);
    const unaligned = openTasks.filter((task) => !task.goalId || !goals.some((goal) => goal.id === task.goalId));
    return unaligned.length ? [...aligned, { goal: null, tasks: unaligned }] : aligned;
  }, [goals, openTasks]);
  const goalById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal])), [goals]);

  if (!openTasks.length) {
    return <section className="mindmap-empty"><CheckCircle2 size={34} /><h2>Your open-task map is clear</h2><p>New open tasks will appear here instantly.</p></section>;
  }

  return (
    <section className="mindmap-panel">
      <div className="mindmap-toolbar">
        <div className="live-map-status"><span /><strong>Live workspace</strong><small>{openTasks.length} open tasks · {branches.length} branches</small></div>
        <div className="map-mode-switch" role="group" aria-label="Map view">
          <button type="button" className={mode === "mind" ? "active" : ""} aria-pressed={mode === "mind"} onClick={() => setMode("mind")}><Network size={15} /> Mind map</button>
          <button type="button" className={mode === "words" ? "active" : ""} aria-pressed={mode === "words"} onClick={() => setMode("words")}><Sparkles size={15} /> Word map</button>
        </div>
      </div>

      {mode === "mind" ? (
        <div className="mindmap-canvas" tabIndex={0} aria-label="Open tasks grouped by goal">
          <div className="mindmap-tree">
            <div className="mindmap-root"><span><Network size={20} /></span><div><strong>Open tasks</strong><small>{openTasks.length} moving outcomes</small></div></div>
            <div className="mindmap-trunk" aria-hidden="true" />
            <div className="mindmap-branches">
              {branches.map((branch) => {
                const color = branch.goal?.color ?? "#7b8494";
                const branchKey = branch.goal?.id ?? "unaligned";
                return (
                  <article className="mindmap-branch" key={branchKey} style={{ "--branch-color": color } as CSSProperties}>
                    <header><span><Target size={16} /></span><div><strong>{branch.goal?.title ?? "No goal yet"}</strong><small>{branch.tasks.length} open task{branch.tasks.length === 1 ? "" : "s"}</small></div></header>
                    <div className="mindmap-leaves">
                      {branch.tasks.map((task) => (
                        <button type="button" key={task.id} onClick={() => onEditTask(task.id)} title={`Edit ${task.title}`}>
                          <span className={`goal-priority-dot priority-${task.priority.toLowerCase().replaceAll(" ", "-")}`} />
                          <span><strong>{task.title}</strong><small><Folder size={11} />{task.project}<Clock3 size={11} />{task.duration}m</small></span>
                        </button>
                      ))}
                    </div>
                    {!branch.goal && <button className="mindmap-create-goal" type="button" onClick={onCreateGoal}><Plus size={13} /> Create a goal</button>}
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="wordmap-canvas" aria-label="Weighted word map of open tasks">
          {openTasks.map((task) => {
            const goal = task.goalId ? goalById.get(task.goalId) : undefined;
            return (
              <button className={`wordmap-word weight-${taskWeight(task.priority)}`} type="button" key={task.id} onClick={() => onEditTask(task.id)} style={{ "--word-color": goal?.color ?? "#7b8494" } as CSSProperties}>
                <strong>{task.title}</strong>
                <small>{goal?.title ?? "No goal"} · {task.project}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
