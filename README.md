# Crawler

Crawler turns a person, creator, shop, brand, manufacturer or project into an
AI-readable **Presence**: one structured Knowledge Core, built through an
adaptive AI interview, published as `llms.txt`, markdown pages and JSON
endpoints that AI systems and crawlers can read.

Production: **https://crawler-presence.lovable.app**
MCP connector: **https://crawler-presence.lovable.app/mcp**
Health: **https://crawler-presence.lovable.app/api/public/mcp-health**

## Architecture

- **TanStack Start** (React 19, Vite) — website + server functions.
- **MCP server** (`@lovable.dev/mcp-js`) mounted at `/mcp`, tools in
  `src/lib/mcp/tools/`, registered in `src/lib/mcp/index.ts`.
  Public, **no-auth** endpoint (auth type `none`) for ChatGPT Developer Mode.
  Crawler has **no OAuth, no login, no registration and no user accounts**.
- **Knowledge Core** (`src/lib/knowledge.ts`) — one shared model for web and
  MCP; generates llms.txt, llms-full.txt, about.md and the relevant
  projects/products/services/faq/cv markdown plus JSON endpoints.
- **Interview** (`src/lib/interview-core.server.ts`) — adaptive questioning via
  the Lovable AI gateway; verified facts kept separate from narrative claims.
- **Database** (Lovable Cloud / Postgres): `mcp_sessions` (durable anonymous
  drafts, opaque `sess_` tokens, 30-day retention), `published_presences`
  (public slug, generated files, **hash** of the management secret, online /
  offline status, subscription state), `publish_intents` (anonymous, short-lived
  publish capability referenced by the payment provider) and `mcp_rate_limits`.
  All four are RLS-locked with no policies and reachable only through the
  server-side service-role client in `src/lib/mcp/db.server.ts` — never from the
  browser.
- **Accountless ownership**: publishing issues a 160-bit management secret. The
  user receives it once as a recovery code `<slug>~crw_…`; only its SHA-256 hash
  is stored. It gates `/manage`: take offline, put back online, rotate the code
  and open the billing portal. A lost code cannot be recovered by anyone.
- **Public delivery**: `/p/:slug` (index) and `/p/:slug/*` (raw files).

## Flow

1. Build in ChatGPT (`@Crawler`) or on the site — free, anonymous, no account.
2. `publish_presence` returns `publish_requires_payment=true` and a handoff URL
   `/publish?session=<token>` that recovers the exact draft on the website.
3. Choose a plan and pay. The payment provider only ever sees an anonymous
   publish-intent reference; Crawler creates no account.
4. The Presence goes live at `/p/:slug/...` and the recovery code is shown once.
5. Manage it later at `/manage` with that code.

## Pricing

Plus $5/mo · Pro $20/mo · Business $80/mo. Creation and preview are free; you
pay only to be online.

## Demo-only in this build

- **Checkout**: no Stripe keys → the whole plan/publish flow runs in clearly
  labelled DEMO/TEST mode. No charge, no real subscription.
- **Analytics**: seeded and prominently labelled DEMO. Crawler only ever
  measures Crawler-internal events and observable reads of published files —
  never private ChatGPT, Claude or Gemini conversations.
- **Ownership**: capability-based and fully anonymous. There is no account to
  sign in to; the recovery code is the credential.

## Testing

```bash
curl -s https://crawler-presence.lovable.app/api/public/mcp-health
curl -s -X POST https://crawler-presence.lovable.app/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Session persistence regression test — performs `start_interview` ->
`get_knowledge_core` -> `continue_interview` -> `get_knowledge_core` in four
separate HTTP requests and asserts the Knowledge Core persists and evolves:

```bash
node scripts/mcp-session-persistence.mjs https://crawler-presence.lovable.app
# defaults to http://localhost:8080
```

Sessions are stored durably in Postgres (`mcp_sessions`, 30-day retention).
`saveSession` performs a single verified upsert of the complete state and
throws on a failed write; the in-memory map is only used when no database is
configured at all.

Setup instructions for ChatGPT live at `/chatgpt`.
