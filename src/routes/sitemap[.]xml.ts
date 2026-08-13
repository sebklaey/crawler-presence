import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://crawler.today";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/pricing", changefreq: "monthly", priority: "0.9" },
          { path: "/chatgpt", changefreq: "monthly", priority: "0.8" },
          { path: "/preview", changefreq: "monthly", priority: "0.6" },
          { path: "/knowledge", changefreq: "monthly", priority: "0.6" },
          { path: "/publish", changefreq: "monthly", priority: "0.6" },
          { path: "/analytics", changefreq: "monthly", priority: "0.5" },
          { path: "/manage", changefreq: "monthly", priority: "0.5" },
          { path: "/crawlme", changefreq: "monthly", priority: "0.7" },
          { path: "/team", changefreq: "monthly", priority: "0.4" },
          { path: "/support", changefreq: "monthly", priority: "0.4" },
          { path: "/terms", changefreq: "yearly", priority: "0.3" },
          { path: "/privacy", changefreq: "yearly", priority: "0.3" },
          { path: "/refunds", changefreq: "yearly", priority: "0.3" },
          { path: "/llms.txt", changefreq: "weekly", priority: "0.7" },
          { path: "/llms-full.txt", changefreq: "weekly", priority: "0.6" },
          { path: "/about.md", changefreq: "monthly", priority: "0.5" },
          { path: "/faq.md", changefreq: "monthly", priority: "0.5" },
          { path: "/services.md", changefreq: "monthly", priority: "0.5" },
          { path: "/api/entity.json", changefreq: "weekly", priority: "0.5" },
          { path: "/api/services.json", changefreq: "weekly", priority: "0.4" },

        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
