import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/services.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("services.md", request) } },
});
