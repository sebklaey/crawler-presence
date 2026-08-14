import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/api/offerings.json")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("api/offerings.json", request) } },
});
