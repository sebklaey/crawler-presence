import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/llms-full.txt")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("llms-full.txt", request) } },
});
