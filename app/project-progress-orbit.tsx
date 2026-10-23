"use client";

import { useId } from "react";

type OrbitCategory = { name: string; count: number; projects: number; color: string };

export function ProjectProgressOrbit({ categories, periodTitle, onSelectCategory }: { categories: OrbitCategory[]; periodTitle: string; onSelectCategory: (name: string) => void }) {
  const titleId = useId();
  const descriptionId = useId();
  const ranked = [...categories].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = ranked.reduce((sum, category) => sum + category.count, 0);
  const max = Math.max(1, ...ranked.map(category => category.count));
  // A numbered map keeps long category names readable in the adjacent, interactive key.
  const radius = Math.max(180, ranked.length * 15);
  const center = radius + 65;
  const size = center * 2;
  const positions = ranked.map((category, index) => {
    const angle = index / ranked.length * Math.PI * 2 - Math.PI / 2;
    return { ...category, x: Number((center + Math.cos(angle) * radius).toFixed(2)), y: Number((center + Math.sin(angle) * radius).toFixed(2)), r: 13 + 22 * Math.sqrt(category.count / max) };
  });
  return <div className="progress-orbit-panel progress-panel">
    <div className="progress-panel-heading"><div><h3>Where your tasks gravitate</h3><p>Completed tasks by parent category · {periodTitle}. Larger nodes and stronger connections mean more completions. Select a category below to explore its tasks.</p></div></div>
    {total === 0 ? <p className="progress-empty" role="status">No dated completions in this selection. Choose another date or period to see category gravity.</p> : <p className="progress-orbit-leader"><span className="project-dot" style={{ background: ranked[0].color }} /><strong>{ranked.filter(category => category.count === ranked[0].count).length > 1 ? "Joint strongest pull" : "Strongest pull"}:</strong> {ranked.filter(category => category.count === ranked[0].count).map(category => category.name).join(", ")} · {ranked[0].count} completed each · {Math.round(ranked[0].count / total * 100)}% each</p>}
    <div className="progress-orbit-grid">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`} className="progress-orbit-map">
        <title id={titleId}>Circular orbit of completed tasks by parent category</title>
        <desc id={descriptionId}>{total} completed tasks in {periodTitle}. {ranked.map(category => `${category.name}: ${category.count} (${total ? Math.round(category.count / total * 100) : 0} percent)`).join(". ")}. Node areas and connection widths indicate completion counts; positions do not indicate time or priority.</desc>
        <circle cx={center} cy={center} r={radius} className="progress-orbit-ring" />
        <circle cx={center} cy={center} r={radius * .68} className="progress-orbit-ring inner" />
        {positions.map(category => <g key={category.name} opacity={category.count ? 1 : .35}>
          <line x1={center} y1={center} x2={category.x} y2={category.y} stroke={category.color} strokeWidth={category.count ? 1 + 11 * category.count / max : 1} strokeOpacity={category.count ? .36 : .2} strokeDasharray={category.count ? undefined : "3 5"} />
          {category.count > 0 && [0.37, .58, .78].map((fraction, index) => <circle key={fraction} cx={center + (category.x - center) * fraction} cy={center + (category.y - center) * fraction} r={2 + category.count / max * 2} fill={category.color} opacity={.4 + index * .2} />)}
        </g>)}
        <circle cx={center} cy={center} r={62} className="progress-orbit-core" />
        <text x={center} y={center - 3} textAnchor="middle" className="progress-orbit-total">{total}</text>
        <text x={center} y={center + 20} textAnchor="middle" className="progress-orbit-caption">completed tasks</text>
        {positions.map((category, index) => <g key={category.name}>
          <title>{category.name}: {category.count} completed tasks</title>
          <circle cx={category.x} cy={category.y} r={category.r + 5} fill={category.color} opacity={.08} />
          <circle cx={category.x} cy={category.y} r={category.r} fill={category.count ? category.color : "var(--paper)"} stroke={category.color} strokeWidth={1.5} opacity={category.count ? 1 : .45} />
          <text x={category.x} y={category.y + 4} textAnchor="middle" className={category.count ? "progress-orbit-node-count" : "progress-orbit-zero"}>{category.count}</text>
          <text x={category.x} y={category.y + category.r + 20} textAnchor="middle" className="progress-orbit-node-label">{String(index + 1).padStart(2, "0")}</text>
        </g>)}
      </svg>
      <ol className="progress-orbit-key" aria-label="Parent category completion shares">
        {ranked.map((category, index) => <li key={category.name}><button type="button" onClick={() => onSelectCategory(category.name)} aria-label={`Explore ${category.name}: ${category.count} completed tasks, ${total ? Math.round(category.count / total * 100) : 0}% of selected completions`}>
          <span className="progress-orbit-key-number" style={{ color: category.color }}>{String(index + 1).padStart(2, "0")}</span><span className="progress-orbit-key-copy"><strong>{category.name}</strong><small>{category.projects} projects / priorities</small><i><b style={{ width: `${total ? category.count / total * 100 : 0}%`, background: category.color }} /></i></span><span className="progress-orbit-key-value"><strong>{category.count}</strong><small>{total ? Math.round(category.count / total * 100) : 0}%</small></span>
        </button></li>)}
      </ol>
    </div>
    <p className="progress-timeline-note">Gravity measures completed-task count, without weighting task duration or priority. N/A, undated and future completions are excluded. All category, project and status filters apply.</p>
  </div>;
}
