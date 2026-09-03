"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, CircleDot, Edit3, Minus, Network, Pause, Play, Plus, RotateCcw, Sparkles, Target, Trash2 } from "lucide-react";
import type { Goal } from "@/lib/goals";

type GoalTask = {
  id: number;
  title: string;
  project: string;
  due: string;
  duration: number;
  priority: "Very High" | "High" | "Medium" | "Low";
  status?: "todo" | "in-progress" | "done";
  completed: boolean;
  goalId?: string;
};

type UniverseNode = {
  id: string;
  kind: "root" | "goal" | "task";
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  taskId?: number;
  goalId?: string;
  project?: string;
  priority?: GoalTask["priority"];
  status?: "todo" | "in-progress" | "done";
  taskCount?: number;
};

type UniverseEdge = { source: string; target: string; color: string };
type ProjectedNode = UniverseNode & { screenX: number; screenY: number; depth: number; scale: number; hitRadius: number };
type UniverseScene = { nodes: UniverseNode[]; edges: UniverseEdge[]; branchCount: number; unalignedCount: number };

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const UNALIGNED_COLOR = "#7b8494";

function taskStatus(task: GoalTask): "todo" | "in-progress" | "done" {
  if (task.completed || task.status === "done") return "done";
  return task.status === "in-progress" ? "in-progress" : "todo";
}

function taskRadius(priority: GoalTask["priority"]) {
  return priority === "Very High" ? 7.5 : priority === "High" ? 6.5 : priority === "Medium" ? 5.5 : 4.5;
}

function buildUniverseScene(goals: Goal[], tasks: GoalTask[]): UniverseScene {
  const goalIds = new Set(goals.map((goal) => goal.id));
  const branches = goals
    .map((goal) => ({ goal, tasks: tasks.filter((task) => task.goalId === goal.id) }))
    .filter((branch) => branch.tasks.length > 0);
  const unalignedTasks = tasks.filter((task) => !task.goalId || !goalIds.has(task.goalId));
  const allBranches = unalignedTasks.length ? [...branches, { goal: null, tasks: unalignedTasks }] : branches;
  const nodes: UniverseNode[] = [{ id: "root", kind: "root", label: "All tasks", color: "#2457ff", x: 0, y: 0, z: 0, radius: 15, taskCount: tasks.length }];
  const edges: UniverseEdge[] = [];
  const branchRadius = Math.min(340, Math.max(170, 145 + allBranches.length * 10));

  allBranches.forEach((branch, branchIndex) => {
    const branchCount = allBranches.length;
    const normalizedY = branchCount === 1 ? 0 : 1 - (branchIndex / (branchCount - 1)) * 2;
    const horizontalRadius = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
    const angle = branchIndex * GOLDEN_ANGLE;
    const branchNodeId = branch.goal ? `goal-${branch.goal.id}` : "goal-unaligned";
    const branchColor = branch.goal?.color || UNALIGNED_COLOR;
    const center = {
      x: Math.cos(angle) * horizontalRadius * branchRadius,
      y: normalizedY * branchRadius * 0.7,
      z: Math.sin(angle) * horizontalRadius * branchRadius,
    };

    nodes.push({
      id: branchNodeId,
      kind: "goal",
      label: branch.goal?.title ?? "No goal yet",
      color: branchColor,
      ...center,
      radius: Math.min(13, 8 + Math.sqrt(branch.tasks.length)),
      goalId: branch.goal?.id,
      taskCount: branch.tasks.length,
    });
    edges.push({ source: "root", target: branchNodeId, color: branchColor });

    const taskShellRadius = Math.min(125, 50 + Math.sqrt(branch.tasks.length) * 13);
    branch.tasks.forEach((task, taskIndex) => {
      const count = branch.tasks.length;
      const localY = count === 1 ? 0 : 1 - (taskIndex / (count - 1)) * 2;
      const localHorizontal = Math.sqrt(Math.max(0, 1 - localY * localY));
      const localAngle = (taskIndex + branchIndex * 0.37) * GOLDEN_ANGLE;
      const nodeId = `task-${task.id}`;
      nodes.push({
        id: nodeId,
        kind: "task",
        label: task.title,
        color: branchColor,
        x: center.x + Math.cos(localAngle) * localHorizontal * taskShellRadius,
        y: center.y + localY * taskShellRadius * 0.76,
        z: center.z + Math.sin(localAngle) * localHorizontal * taskShellRadius,
        radius: taskRadius(task.priority),
        taskId: task.id,
        goalId: task.goalId,
        project: task.project,
        priority: task.priority,
        status: taskStatus(task),
      });
      edges.push({ source: branchNodeId, target: nodeId, color: branchColor });
    });
  });

  return { nodes, edges, branchCount: allBranches.length, unalignedCount: unalignedTasks.length };
}

function shortNodeLabel(value: string, limit = 27) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function formatTargetDate(value: string) {
  if (!value) return "No target date";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectedNodes = useRef<ProjectedNode[]>([]);
  const view = useRef({ yaw: -0.55, pitch: -0.28, zoom: 1, autoRotate: true });
  const drag = useRef<{ pointerId: number; startX: number; startY: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const scene = useMemo(() => buildUniverseScene(goals, tasks), [goals, tasks]);
  const nodeById = useMemo(() => new Map(scene.nodes.map((node) => [node.id, node])), [scene]);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const goalById = useMemo(() => new Map(goals.map((goal) => [goal.id, goal])), [goals]);
  const [selectedNodeId, setSelectedNodeId] = useState("root");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const selectedNode = nodeById.get(selectedNodeId) ?? nodeById.get("root");
  const selectedTask = selectedNode?.taskId ? taskById.get(selectedNode.taskId) : undefined;
  const selectedGoal = selectedNode?.goalId ? goalById.get(selectedNode.goalId) : undefined;
  const completedCount = tasks.filter((task) => taskStatus(task) === "done").length;
  const inProgressCount = tasks.filter((task) => taskStatus(task) === "in-progress").length;
  const openCount = tasks.length - completedCount;
  const sortedTasks = useMemo(() => [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed) || a.title.localeCompare(b.title)), [tasks]);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pauseRotation = window.setTimeout(() => {
      view.current.autoRotate = false;
      setAutoRotate(false);
    }, 0);
    return () => window.clearTimeout(pauseRotation);
  }, []);

  useEffect(() => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas) return;
    const canvas: HTMLCanvasElement = currentCanvas;
    const currentContext = canvas.getContext("2d");
    if (!currentContext) return;
    const context: CanvasRenderingContext2D = currentContext;
    const maxExtent = Math.max(1, ...scene.nodes.map((node) => Math.hypot(node.x, node.y)));
    let animationFrame = 0;
    let lastFrame = performance.now();
    let lastDraw = 0;
    let themeName = "";
    let fontFamily = "Arial, sans-serif";
    let colors = { ink: "#111318", muted: "#737985", paper: "#ffffff", line: "#dde1e7", blue: "#2457ff" };

    function readTheme() {
      const nextTheme = document.documentElement.dataset.theme ?? "light";
      if (nextTheme === themeName) return;
      themeName = nextTheme;
      const styles = getComputedStyle(canvas);
      fontFamily = styles.fontFamily || fontFamily;
      colors = {
        ink: styles.getPropertyValue("--ink").trim() || colors.ink,
        muted: styles.getPropertyValue("--muted").trim() || colors.muted,
        paper: styles.getPropertyValue("--paper").trim() || colors.paper,
        line: styles.getPropertyValue("--line").trim() || colors.line,
        blue: styles.getPropertyValue("--blue").trim() || colors.blue,
      };
    }

    function project(node: UniverseNode, width: number, height: number): ProjectedNode {
      const yawCos = Math.cos(view.current.yaw);
      const yawSin = Math.sin(view.current.yaw);
      const pitchCos = Math.cos(view.current.pitch);
      const pitchSin = Math.sin(view.current.pitch);
      const rotatedX = node.x * yawCos - node.z * yawSin;
      const yawZ = node.x * yawSin + node.z * yawCos;
      const rotatedY = node.y * pitchCos - yawZ * pitchSin;
      const rotatedZ = node.y * pitchSin + yawZ * pitchCos;
      const cameraDistance = 720;
      const fit = Math.min(1, Math.max(0.48, (Math.min(width, height * 1.5) * 0.43) / maxExtent));
      const scale = fit * view.current.zoom * cameraDistance / Math.max(220, cameraDistance + rotatedZ);
      return {
        ...node,
        screenX: width / 2 + rotatedX * scale,
        screenY: height / 2 + rotatedY * scale,
        depth: rotatedZ,
        scale,
        hitRadius: Math.max(13, node.radius * scale + 7),
      };
    }

    function drawLabel(node: ProjectedNode, isSelected: boolean, isHovered: boolean, width: number) {
      const showGoalLabel = node.kind === "goal" && (scene.branchCount <= 18 || (node.taskCount ?? 0) > 1);
      if (node.kind !== "root" && !showGoalLabel && !isSelected && !isHovered) return;
      const label = shortNodeLabel(node.label, node.kind === "task" ? 34 : 27);
      const fontSize = node.kind === "root" ? 12 : 10;
      context.font = `${node.kind === "root" ? 650 : 560} ${fontSize}px ${fontFamily}`;
      const textWidth = Math.min(width - 24, context.measureText(label).width + 14);
      const labelX = Math.min(width - textWidth - 7, Math.max(7, node.screenX - textWidth / 2));
      const labelY = node.screenY + Math.max(12, node.radius * node.scale + 7);
      context.globalAlpha = isSelected || isHovered ? 0.98 : 0.86;
      context.fillStyle = colors.paper;
      context.fillRect(labelX, labelY, textWidth, 22);
      context.strokeStyle = isSelected || isHovered ? (node.kind === "root" ? colors.blue : node.color) : colors.line;
      context.lineWidth = 1;
      context.strokeRect(labelX + 0.5, labelY + 0.5, textWidth - 1, 21);
      context.fillStyle = colors.ink;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, labelX + textWidth / 2, labelY + 11, textWidth - 10);
    }

    function drawNode(node: ProjectedNode) {
      const isSelected = node.id === selectedNodeId;
      const isHovered = node.id === hoveredNodeId;
      const radius = Math.max(node.kind === "task" ? 3.5 : 6, node.radius * node.scale);
      const nodeColor = node.kind === "root" ? colors.blue : node.color;
      context.save();
      context.translate(node.screenX, node.screenY);
      context.globalAlpha = node.status === "done" ? 0.48 : Math.min(1, 0.72 + node.scale * 0.22);

      if (isSelected || isHovered) {
        context.beginPath();
        context.arc(0, 0, radius + 7, 0, Math.PI * 2);
        context.strokeStyle = nodeColor;
        context.globalAlpha = 0.28;
        context.lineWidth = 4;
        context.stroke();
        context.globalAlpha = 1;
      }

      if (node.kind === "root") {
        context.beginPath();
        context.arc(0, 0, radius + 7, 0, Math.PI * 2);
        context.strokeStyle = nodeColor;
        context.lineWidth = 1.5;
        context.stroke();
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.fillStyle = nodeColor;
        context.fill();
      } else if (node.kind === "goal") {
        context.rotate(Math.PI / 4);
        context.fillStyle = colors.paper;
        context.strokeStyle = nodeColor;
        context.lineWidth = isSelected ? 3 : 2;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
        context.strokeRect(-radius, -radius, radius * 2, radius * 2);
      } else if (node.status === "in-progress") {
        context.rotate(Math.PI / 4);
        context.fillStyle = nodeColor;
        context.fillRect(-radius, -radius, radius * 2, radius * 2);
      } else {
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        if (node.status === "done") {
          context.strokeStyle = nodeColor;
          context.lineWidth = 2;
          context.stroke();
          context.beginPath();
          context.moveTo(-radius * 0.45, 0);
          context.lineTo(-radius * 0.08, radius * 0.38);
          context.lineTo(radius * 0.55, -radius * 0.4);
          context.stroke();
        } else {
          context.fillStyle = nodeColor;
          context.fill();
        }
      }
      context.restore();
    }

    function render(now: number) {
      animationFrame = window.requestAnimationFrame(render);
      if (now - lastDraw < 32 || document.hidden) return;
      const elapsed = Math.min(50, now - lastFrame);
      lastFrame = now;
      lastDraw = now;
      if (view.current.autoRotate && !drag.current) view.current.yaw += elapsed * 0.00011;

      const rect = canvas.getBoundingClientRect();
      const width = Math.max(280, Math.round(rect.width));
      const height = Math.max(420, Math.round(rect.height));
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      readTheme();

      const projected = scene.nodes.map((node) => project(node, width, height));
      projectedNodes.current = projected;
      const projectedById = new Map(projected.map((node) => [node.id, node]));

      scene.edges.forEach((edge) => {
        const source = projectedById.get(edge.source);
        const target = projectedById.get(edge.target);
        if (!source || !target) return;
        context.beginPath();
        context.moveTo(source.screenX, source.screenY);
        context.lineTo(target.screenX, target.screenY);
        context.strokeStyle = edge.color;
        context.globalAlpha = target.status === "done" ? 0.12 : 0.25;
        context.lineWidth = Math.max(0.65, Math.min(1.8, target.scale));
        context.stroke();
      });

      const depthSorted = [...projected].sort((a, b) => b.depth - a.depth);
      depthSorted.forEach(drawNode);
      depthSorted.forEach((node) => drawLabel(node, node.id === selectedNodeId, node.id === hoveredNodeId, width));
      context.globalAlpha = 1;
    }

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [hoveredNodeId, scene, selectedNodeId]);

  function hitNode(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return projectedNodes.current
      .map((node) => ({ node, distance: Math.hypot(node.screenX - x, node.screenY - y) }))
      .filter(({ node, distance }) => distance <= node.hitRadius)
      .sort((a, b) => a.distance / a.node.hitRadius - b.distance / b.node.hitRadius)[0]?.node ?? null;
  }

  function stopAutoRotation() {
    view.current.autoRotate = false;
    setAutoRotate(false);
  }

  function rotateBy(yaw: number, pitch = 0) {
    stopAutoRotation();
    view.current.yaw += yaw;
    view.current.pitch = Math.max(-1.15, Math.min(1.15, view.current.pitch + pitch));
  }

  function zoomBy(multiplier: number) {
    stopAutoRotation();
    view.current.zoom = Math.max(0.55, Math.min(2.25, view.current.zoom * multiplier));
  }

  function resetView() {
    view.current = { yaw: -0.55, pitch: -0.28, zoom: 1, autoRotate: false };
    setAutoRotate(false);
    setSelectedNodeId("root");
  }

  function toggleAutoRotation() {
    const next = !autoRotate;
    view.current.autoRotate = next;
    setAutoRotate(next);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, yaw: view.current.yaw, pitch: view.current.pitch, moved: false };
    stopAutoRotation();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (drag.current?.pointerId === event.pointerId) {
      const deltaX = event.clientX - drag.current.startX;
      const deltaY = event.clientY - drag.current.startY;
      if (Math.hypot(deltaX, deltaY) > 4) drag.current.moved = true;
      view.current.yaw = drag.current.yaw + deltaX * 0.007;
      view.current.pitch = Math.max(-1.15, Math.min(1.15, drag.current.pitch + deltaY * 0.006));
      return;
    }
    const node = hitNode(event.clientX, event.clientY);
    setHoveredNodeId((current) => current === node?.id ? current : node?.id ?? null);
    event.currentTarget.style.cursor = node ? "pointer" : "grab";
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const activeDrag = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!activeDrag?.moved) {
      const node = hitNode(event.clientX, event.clientY);
      if (node) setSelectedNodeId(node.id);
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => rotateBy(-0.14),
      ArrowRight: () => rotateBy(0.14),
      ArrowUp: () => rotateBy(0, -0.12),
      ArrowDown: () => rotateBy(0, 0.12),
      "+": () => zoomBy(1.12),
      "=": () => zoomBy(1.12),
      "-": () => zoomBy(0.88),
      r: resetView,
      R: resetView,
      " ": toggleAutoRotation,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  if (!tasks.length) {
    return <section className="mindmap-empty"><Network size={34} /><h2>Your task universe is ready</h2><p>New tasks will appear here instantly in three dimensions.</p></section>;
  }

  const selectedStatus = selectedTask ? taskStatus(selectedTask) : undefined;
  const selectedStatusLabel = selectedStatus === "done" ? "Completed" : selectedStatus === "in-progress" ? "In progress" : "To do";

  return (
    <section className="mindmap-panel task-universe-panel">
      <div className="mindmap-toolbar">
        <div className="live-map-status" aria-live="polite"><span /><strong>Live 3D workspace</strong><small>{tasks.length} total · {openCount} open · {completedCount} completed · {scene.branchCount} branches</small></div>
        <div className="task-universe-controls" role="group" aria-label="3D map controls">
          <button type="button" onClick={() => rotateBy(-0.24)} aria-label="Rotate left">← Rotate</button>
          <button type="button" onClick={() => zoomBy(1.14)} aria-label="Zoom in"><Plus size={14} /> Zoom</button>
          <button type="button" onClick={() => zoomBy(0.86)} aria-label="Zoom out"><Minus size={14} /></button>
          <button type="button" onClick={resetView}><RotateCcw size={14} /> Reset</button>
          <button type="button" className={autoRotate ? "active" : ""} aria-pressed={autoRotate} onClick={toggleAutoRotation}>{autoRotate ? <Pause size={14} /> : <Play size={14} />}{autoRotate ? "Pause" : "Auto rotate"}</button>
        </div>
      </div>

      <div className="task-universe-stage">
        <canvas
          ref={canvasRef}
          className="task-universe-canvas"
          tabIndex={0}
          role="application"
          aria-roledescription="interactive 3D task map"
          aria-label={`Live 3D map of all ${tasks.length} tasks grouped into ${scene.branchCount} goal branches`}
          aria-describedby="task-universe-instructions"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { drag.current = null; }}
          onPointerLeave={() => setHoveredNodeId(null)}
          onDoubleClick={(event) => {
            const node = hitNode(event.clientX, event.clientY);
            if (node?.taskId) onEditTask(node.taskId);
          }}
          onWheel={handleWheel}
          onKeyDown={handleKeyDown}
        >Interactive 3D map of all Orbit tasks.</canvas>
        <p className="task-universe-instructions" id="task-universe-instructions">Drag to rotate · scroll to zoom · select a node for details · double-click a task to edit. Keyboard: arrows, +/−, R, and Space.</p>
        <div className="task-universe-legend" aria-label="3D task map legend">
          <span><i className="todo" />To do</span>
          <span><i className="progress" />In progress</span>
          <span><i className="complete" />Completed</span>
          <span><i className="goal" />Goal branch</span>
        </div>
      </div>

      <div className="task-universe-footer">
        <label className="task-universe-jump"><span>Find any task</span><select value={selectedTask?.id ?? ""} onChange={(event) => setSelectedNodeId(event.target.value ? `task-${event.target.value}` : "root")}><option value="">All tasks</option>{sortedTasks.map((task) => <option key={task.id} value={task.id}>{task.completed ? "✓ " : ""}{task.title}</option>)}</select></label>
        <div className="task-universe-detail" aria-live="polite">
          <span className={`universe-detail-mark ${selectedNode?.kind ?? "root"}`} style={{ "--node-color": selectedNode?.kind === "root" ? "var(--blue)" : selectedNode?.color ?? "var(--blue)" } as CSSProperties}>{selectedNode?.kind === "task" ? <CircleDot size={17} /> : selectedNode?.kind === "goal" ? <Target size={17} /> : <Network size={17} />}</span>
          <div>
            <strong>{selectedNode?.label ?? "All tasks"}</strong>
            <small>{selectedTask ? `${selectedStatusLabel} · ${selectedTask.project} · ${selectedTask.priority} priority · ${selectedTask.duration}m` : selectedNode?.kind === "goal" ? `${selectedNode.taskCount ?? 0} connected tasks${selectedGoal?.targetDate ? ` · target ${formatTargetDate(selectedGoal.targetDate)}` : ""}` : `${openCount} open · ${inProgressCount} in progress · ${completedCount} completed`}</small>
          </div>
          {selectedTask && <button type="button" onClick={() => onEditTask(selectedTask.id)}>Edit task <ArrowRight size={14} /></button>}
          {selectedNode?.id === "goal-unaligned" && <button type="button" onClick={onCreateGoal}><Plus size={14} /> Create goal</button>}
        </div>
      </div>
    </section>
  );
}
