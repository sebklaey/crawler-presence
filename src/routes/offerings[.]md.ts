import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/offerings.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("offerings.md", request) } },
});
