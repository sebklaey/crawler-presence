import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/pricing.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("pricing.md", request) } },
});
