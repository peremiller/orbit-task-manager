import { notFound } from "next/navigation";
import Home, { type View } from "../page";

const ROUTE_VIEWS: Record<string, View> = {
  today: "today",
  inbox: "inbox",
  upcoming: "upcoming",
  board: "board",
  projects: "projects",
  insights: "analytics",
  completed: "completed",
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
