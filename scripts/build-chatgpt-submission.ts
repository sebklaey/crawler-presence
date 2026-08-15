import { writeFileSync } from "node:fs";
import manifest from "../.lovable/mcp/manifest.json" with { type: "json" };
import { CRAWLER_VERSION } from "../src/lib/version";

const siteUrl = "https://crawler.today";
const supportEmail = "sebklay@me.com";

const submission = {
  "$schema": "https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json",
  "schema_version": 1,
  "app": {
    "name": "Crawler",
    "slug": "crawler",
    "tagline": "Build an AI-readable public Presence for yourself, your project, or your brand — in minutes, without an account.",
    "description": "Crawler turns a free-form conversation into a structured public Presence (llms.txt, about.md, FAQ, offerings, JSON API) that AI assistants and search agents can read. It also powers small, anonymous topic rooms for focused chats. No login, no account — ownership is capability-based with a recovery code.",
    "long_description": "Crawler is an accountless Presence builder for people, creators, companies, projects, and products. Through an adaptive AI-driven interview, it builds a verified Knowledge Core, then publishes AI-readable files (llms.txt, llms-full.txt, about.md, offerings.md, services.md, projects.md, faq.md, cv.md, JSON endpoints) and a public Presence page at a stable slug. Creation and preview are always free; publishing and hosting are a paid subscription (Plus $5/mo, Pro $20/mo, Business $80/mo).\n\nCrawler also hosts anonymous topic rooms: users can enter topic rooms and the Universal Room, send messages with 24-hour retention, set aliases, follow rooms, and share profiles. No account is required; a single opaque room_token is generated per anonymous identity.\n\nThe Crawler MCP server at https://crawler.today/mcp requires no authentication and does not receive any ChatGPT user identity. Tool arguments carry the only identifiers (session_id, slug, recovery_code, room_token). Draft sessions and rooms are ephemeral and expire after 30 days or 24 hours respectively unless published.",
    "instructions": "Use start_interview when a user describes a person, creator, product, company, project or brand they want to make discoverable. Ask the single most valuable follow-up question returned by the tool, then use continue_interview to merge the answer. Use get_knowledge_core to inspect the structured core. Use preview_presence to show the user what AI files will look like. When the user is ready to publish, use publish_presence and, if payment is required, hand them the publish_url to complete checkout on the Crawler website. After publishing, the user gets a recovery_code that grants access to manage, analytics, and republish.\n\nFor rooms, use list_topics to see public topics, enter_topic to join, send_message to post, read_messages to read, and set_alias/get_alias to manage a local display name. Profiles and personal/public rooms are managed with their respective tools. Every Crawler room is publicly readable.\n\nAlways use continue_interview to save facts; never invent core_update fields the user did not state.",
    "categories": [
      "Productivity",
      "Developer Tools",
      "Social"
    ],
    "language": "en",
    "homepage_url": siteUrl,
    "privacy_policy_url": `${siteUrl}/privacy`,
    "terms_of_service_url": `${siteUrl}/terms`,
    "refund_policy_url": `${siteUrl}/refund`,
    "support_email": supportEmail,
    "support_url": `mailto:${supportEmail}`,
    "og_image_url": `${siteUrl}/og-image.png`,
    "keywords": [
      "presence",
      "llms.txt",
      "ai readable",
      "personal site",
      "brand",
      "portfolio",
      "anonymous chat",
      "topic rooms",
      "no login",
      "MCP"
    ]
  },
  "auth": {
    "type": "none",
    "description": "Crawler does not use OAuth, login, or account registration. It has no access to the ChatGPT user's identity. The only credentials are opaque, capability-based tokens (session_id, recovery_code, room_token) passed explicitly in tool arguments."
  },
  "data_handling": {
    "stores_user_data": true,
    "user_data_description": "Crawler stores the structured Knowledge Core (identity, facts, offerings, FAQ, CV, links) that the user explicitly provides during the interview. It stores minimal room metadata (messages, aliases, follows) for anonymous rooms. It does not store raw ChatGPT conversation text. Analytics store only event type, entity slug, timestamp, source, and an unlinkable hashed session fingerprint.",
    "data_retention_days": 30,
    "data_processors": [
      {
        "name": "Supabase",
        "purpose": "Cloud PostgreSQL database and storage for durable sessions, published presences, and room data.",
        "privacy_url": "https://supabase.com/privacy"
      },
      {
        "name": "Paddle",
        "purpose": "Payment processing and subscription management.",
        "privacy_url": "https://www.paddle.com/legal/privacy"
      }
    ],
    "encryption_in_transit": true,
    "encryption_at_rest": true,
    "allows_user_deletion": true
  },
  "monetization": {
    "business_model": "subscription",
    "pricing": {
      "currency": "USD",
      "tiers": [
        {
          "name": "Plus",
          "price": 5,
          "billing_period": "monthly",
          "description": "One public Presence with a stable slug and standard AI files."
        },
        {
          "name": "Pro",
          "price": 20,
          "billing_period": "monthly",
          "description": "Up to 5 Presences, custom domain support, and priority publishing."
        },
        {
          "name": "Business",
          "price": 80,
          "billing_period": "monthly",
          "description": "Unlimited Presences, team access, REST API keys, and report emails."
        }
      ]
    },
    "free_tier_description": "Interview, preview, and manage existing presences are free. Publishing and hosting require a paid subscription.",
    "trial_description": "No free trial required for publishing; previewing is free."
  },
  "mcp_server": {
    "url": `${siteUrl}/mcp`,
    "name": manifest.mcp.server.name,
    "version": CRAWLER_VERSION,
    "authentication": "none",
    "identity_note": "Crawler does not receive the ChatGPT user's identity. No authentication is performed and no account is created."
  },
  "tools": manifest.mcp.tools.map((tool) => ({
    "name": tool.name,
    "title": tool.title,
    "description": tool.description,
    "read_only": tool.annotations?.readOnlyHint ?? false,
    "destructive": tool.annotations?.destructiveHint ?? false,
    "idempotent": tool.annotations?.idempotentHint ?? false,
    "open_world": tool.annotations?.openWorldHint ?? false,
    "input_schema": tool.inputSchema,
    "output_schema": tool.outputSchema
  })),
  "testing_instructions": {
    "steps": [
      "Call start_interview with a free_text description like 'I am a freelance UX designer in Berlin who works with early-stage SaaS startups'.",
      "Use the returned next_question and ask the user the follow-up, then send the answer with continue_interview using the session_id.",
      "Call get_knowledge_core with the same session_id to inspect the structured Knowledge Core.",
      "Call preview_presence to show the generated llms.txt and about.md files.",
      "For rooms: call list_topics, then enter_topic with a topic_id, then send_message and read_messages.",
      "To test publishing in live mode, call publish_presence and, if it returns publish_requires_payment=true, open the publish_url in a browser to complete Paddle checkout."
    ]
  },
  "developer": {
    "name": "SEBKLAEY",
    "website": siteUrl,
    "support_email": supportEmail
  },
  "compliance": {
    "digital_only": true,
    "no_user_accounts": true,
    "no_oauth": true,
    "no_login": true,
    "no_social_login": true,
    "no_crawler_user_accounts": true
  }
};

writeFileSync("chatgpt-app-submission.json", JSON.stringify(submission, null, 2) + "\n");
console.log("Wrote chatgpt-app-submission.json with schema_version 1 and", submission.tools.length, "tools.");
