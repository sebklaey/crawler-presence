import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/api/entity.json")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("api/entity.json", request) } },
});
