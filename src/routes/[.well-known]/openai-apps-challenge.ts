import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/openai-apps-challenge")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(
          "3qPHADOSW3Plvq9NzoYl9CW5H7EKzj0D1yOgNSWcf48",
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          }
        );
      },
    },
  },
});
