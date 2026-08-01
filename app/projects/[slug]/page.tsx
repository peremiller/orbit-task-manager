import { notFound } from "next/navigation";
import Home from "../../page";

const PROJECT_IDS = ["product-launch", "platform-upgrade", "quality-systems", "stakeholder-comms", "team-operations"];

export function generateStaticParams() {
  return PROJECT_IDS.map((slug) => ({ slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!PROJECT_IDS.includes(slug)) notFound();

  return <Home initialView="projects" initialProjectId={slug} />;
}
