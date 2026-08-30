import { notFound } from "next/navigation";
import Home, { type View } from "../page";

const ROUTE_VIEWS: Record<string, View> = {
  today: "today",
  inbox: "inbox",
  upcoming: "upcoming",
  planner: "planner",
  "mind-map": "mindMap",
  goals: "goals",
  board: "board",
  "filters-labels": "filtersLabels",
  projects: "projects",
  insights: "analytics",
  "timer-history": "timerHistory",
  completed: "completed",
  actuals: "actuals",
  "effort-plan": "effortPlan",
  "timesheet-report": "timesheetReport",
  dashboard: "workDashboard",
  "selection-manager": "selectionManager",
};

export function generateStaticParams() {
  return Object.keys(ROUTE_VIEWS).map((view) => ({ view }));
}

export default async function ViewPage({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  const initialView = ROUTE_VIEWS[view];
  if (!initialView) notFound();

  return <Home initialView={initialView} />;
}
