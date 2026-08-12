import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/about.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("about.md", request) } },
});
