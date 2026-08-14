import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/news.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("news.md", request) } },
});
