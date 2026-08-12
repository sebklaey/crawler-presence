import { createFileRoute } from "@tanstack/react-router";

import { serveSelfFile } from "@/lib/self-presence";

export const Route = createFileRoute("/faq.md")({
  server: { handlers: { GET: ({ request }) => serveSelfFile("faq.md", request) } },
});
