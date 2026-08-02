import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit Task Manager",
    short_name: "Orbit",
    description: "A calm task manager for focused work, clear priorities, and visible momentum.",
    start_url: "/today",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#2457ff",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
