import { notFound } from "next/navigation";
import Home from "../../page";

const STARTER_PROJECT_IDS = ["product-launch", "platform-upgrade", "quality-systems", "stakeholder-comms", "team-operations"];
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const dynamicParams = true;

export function generateStaticParams() {
  return STARTER_PROJECT_IDS.map((slug) => ({ slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!PROJECT_ID_PATTERN.test(slug)) notFound();

  return <Home initialView="projects" initialProjectId={slug} />;
}
