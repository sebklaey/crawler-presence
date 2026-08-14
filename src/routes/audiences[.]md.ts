import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/audiences.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("audiences.md", request) } },
});
