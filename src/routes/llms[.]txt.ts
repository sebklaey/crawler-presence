import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/llms.txt")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("llms.txt", request) } },
});
