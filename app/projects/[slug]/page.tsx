import { notFound } from "next/navigation";
import Home from "../../page";

const PROJECTS: Record<string, string> = {
  "product-launch": "Product launch",
  "platform-upgrade": "Platform upgrade",
  "quality-systems": "Quality systems",
  "stakeholder-comms": "Stakeholder comms",
  "team-operations": "Team operations",
};

export function generateStaticParams() {
  return Object.keys(PROJECTS).map((slug) => ({ slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = PROJECTS[slug];
  if (!project) notFound();

  return <Home initialView="projects" initialProject={project} />;
}
