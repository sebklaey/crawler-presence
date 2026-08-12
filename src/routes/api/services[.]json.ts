import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/api/services.json")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("api/services.json", request) } },
});
