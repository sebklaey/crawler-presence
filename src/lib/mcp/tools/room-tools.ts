/**
 * Adapter that registers the full Room chat tool set inside Crawler's /mcp endpoint.
 *
 * The Room library exposes JSON-Schema tool descriptors; Crawler's MCP SDK expects
 * raw zod shapes. This module converts them and threads Crawler's accountless
 * `room_token` (an opaque capability string) through as the pseudonymous identity.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { TOOLS } from "@/lib/room/mcp";
import { PERSONAL_TOOLS } from "@/lib/room/mcp.personal";
import { PLUS_TOOLS } from "@/lib/room/mcp.plus";
import { PROFILE_TOOLS } from "@/lib/room/mcp.profile";
import { SUGAR_TOOLS } from "@/lib/room/mcp.sugar";
import { LOVE_TOOLS } from "@/lib/room/mcp.love";
import { MATCH_TOOLS } from "@/lib/room/match/mcp";
import { SOCIAL_TOOLS } from "@/lib/room/social/mcp";
import { toRoomError } from "@/lib/room/errors";
import { requiredPlanForCall } from "@/lib/entitlements/features";
import { toShape } from "@/lib/mcp/schema-to-zod";
import { advertisedOutputShape, responseValidator } from "@/lib/mcp/response";

type Json = Record<string, unknown>;

interface RoomTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema?: Json;
  annotations: Json;
  handler: (input: unknown, meta: Record<string, unknown> | undefined) => Promise<Json>;
  summary: (result: any) => string;
}

/**
 * Runtime contract per tool, also consumed by the contract tests: the advertised
 * shape stays permissive (one shape must cover success and envelope), while the
 * validator is the real discriminated union and stays strict about required
 * success fields.
 */
export const roomToolContracts = new Map<string, ReturnType<typeof responseValidator>>();

function correlationId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `cid_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Output validation is ALWAYS enforced — there is no opt-in environment flag.
 * A payload that violates the declared contract never leaves the server; the
 * caller receives one safe typed OUTPUT_CONTRACT_VIOLATION error instead, which
 * itself satisfies the advertised error envelope of every tool.
 */
export function validateOutput(name: string, payload: Json): Json {
  const validator = roomToolContracts.get(name);
  if (!validator) return payload;
  const parsed = validator.safeParse(payload);
  if (parsed.success) return payload;
  const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  const cid = typeof payload["correlation_id"] === "string" ? (payload["correlation_id"] as string) : correlationId();
  console.error("[room-tool:output]", name, detail);
  return {
    status: "error",
    code: "OUTPUT_CONTRACT_VIOLATION",
    message:
      "Crawler produced a response that does not match its declared output contract. Nothing was returned to avoid an invalid payload. Please report the correlation id.",
    retryable: false,
    correlation_id: cid,
  };
}

/**
 * Read-only classification.
 *
 * `public`   — no identity at all; the handler must stay pure.
 * `identity` — needs a mapped subject; without one the call returns a typed
 *              IDENTITY_REQUIRED and performs zero writes.
 *
 * A read-only call NEVER creates or passes an ephemeral identity.
 */
const PUBLIC_READ_TOOLS = new Set([
  "list_topics",
  "get_image",
  "get_public_sugar",
  "resolve_social_profile",
  "preview_social_profile",
  "list_social_providers",
]);

function readOnlyScope(name: string, input: Record<string, unknown>): "public" | "identity" {
  if (PUBLIC_READ_TOOLS.has(name)) return "public";
  // get_profile with an explicit username is a public profile read.
  if (name === "get_profile" && typeof input["username"] === "string" && input["username"].trim()) return "public";
  return "identity";
}


const TOKEN_FIELD = z
  .string()
  .optional()
  .describe(
    "Opaque anonymous room identity issued by Crawler. Reuse the same room_token for every room_* call of the same person. If omitted, a new anonymous identity is created and returned — store it, there is no account and no other way back.",
  );

const SESSION_FIELD = z
  .string()
  .optional()
  .describe(
    "Optional Crawler draft session id (sess_…) of a paid Presence. Pass it once to unlock the paid room features that this subscription includes.",
  );

function adapt(tool: RoomTool) {
  roomToolContracts.set(tool.name, responseValidator(tool.outputSchema));
  return defineTool({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: { ...toShape(tool.inputSchema), room_token: TOKEN_FIELD, session_id: SESSION_FIELD },
    annotations: tool.annotations as never,
    outputSchema: advertisedOutputShape(tool.outputSchema),


    handler: async (input: Record<string, unknown> | undefined) => {
      const raw = (input ?? {}) as Record<string, unknown>;
      const { room_token: provided, session_id: sessionId, ...rest } = raw;
      const session = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
      const providedToken = typeof provided === "string" && provided.trim() ? provided.trim() : null;
      const readOnly = (tool.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint === true;

      // ONE identity resolver for every domain (Crawler Core).
      const { resolveIdentityContext } = await import("@/lib/core/identity.server");
      const identity = await resolveIdentityContext({
        roomToken: providedToken,
        sessionId: session,
        mutating: !readOnly,
      });
      if (!identity.ok) {
        const { newCorrelationId } = await import("@/lib/core/access.server");
        const unavailable = identity.error === "TEMPORARILY_UNAVAILABLE";
        return {
          isError: true,
          content: [{ type: "text" as const, text: identity.message }],
          structuredContent: validateOutput(tool.name, {
            status: unavailable ? "temporarily_unavailable" : "error",
            code: identity.error,
            message: identity.message,
            retryable: unavailable,
            correlation_id: newCorrelationId(),
          }),
        };
      }

      let knownSubjectHash: string | null = identity.subjectId;
      // A read-only call NEVER invents an identity. Public reads run without
      // one; identity-required reads fail closed with a typed error.
      const scope = readOnly ? readOnlyScope(tool.name, rest) : "identity";
      if (readOnly && scope === "identity" && !identity.roomToken) {
        const message =
          "This read needs your anonymous Crawler identity. Pass the room_token you were given (or a session_id of your paid Presence). Nothing was created.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
          structuredContent: validateOutput(tool.name, {
            status: "error",
            code: "IDENTITY_REQUIRED",
            message,
            retryable: false,
            correlation_id: correlationId(),
          }),
        };
      }
      const token = identity.roomToken;
      const echoToken = identity.roomToken;
      const issued = identity.issued;



      try {
        // Core V2: one resolver merges session, identity and Presence proofs
        // before any gate decides. The caller never supplies its own plan.
        const { resolveAccessContext } = await import("@/lib/core/access.server");
        const { checkToolAccess } = await import("@/lib/entitlements/guard.server");
        const { detectLanguage } = await import("@/lib/entitlements/upgrade.server");
        const access = await resolveAccessContext({
          roomToken: token,
          sessionId: session,
          subjectHash: knownSubjectHash,
        });
        if (!knownSubjectHash && access.subjectHash) knownSubjectHash = access.subjectHash;

        const denied = await checkToolAccess({
          tool: tool.name,
          roomToken: token,
          sessionToken: session,
          subjectHash: access.subjectHash,
          language: detectLanguage(rest),
          feature: tool.title,
          requiredPlan: requiredPlanForCall(tool.name, rest),
        });
        if (denied) {
          const outage = denied.code === "temporarily_unavailable";
          const text = outage
            ? denied.message
            : `${denied.message}\n\n${denied.cta_label}: ${denied.upgrade_url}`;
          const limited = !outage && Boolean((denied as { usage?: unknown }).usage);
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: validateOutput(tool.name, {
              status: outage ? "temporarily_unavailable" : limited ? "limit_reached" : "upgrade_required",
              retryable: outage,
              ...denied,
              ...(echoToken ? { room_token: echoToken } : {}),
            }),
          };
        }



        const { runInCallContext } = await import("@/lib/room/call-context");
        const result = await runInCallContext({ readOnly, toolName: tool.name }, () =>
          tool.handler(rest, {
            ...(token ? { "room/token": token } : {}),
            "crawler/session_id": session,
            ...(knownSubjectHash ? { "room/subject_hash": knownSubjectHash } : {}),
          }),
        );


        let text = tool.summary(result);
        if (issued && echoToken) {
          text += `\n\nAnonymes room_token (bitte speichern und bei jedem weiteren room-Aufruf mitgeben): ${echoToken}`;
        }
        // Internal fields (prefixed with "_") never leave the server as data;
        // "_ui_html" becomes an embedded UI resource block instead.
        const uiHtml = typeof result["_ui_html"] === "string" ? (result["_ui_html"] as string) : null;
        const uiUri = typeof result["_ui_uri"] === "string" ? (result["_ui_uri"] as string) : null;
        const uiMime = typeof result["_ui_mime"] === "string" ? (result["_ui_mime"] as string) : "text/html";
        const publicResult = Object.fromEntries(
          Object.entries(result)
            .filter(([key]) => !key.startsWith("_"))
            // The envelope owns "status" — a domain status travels as result_status.
            .map(([key, value]) => [key === "status" ? "result_status" : key, value]),
        );
        const content: Array<Record<string, unknown>> = [{ type: "text" as const, text }];
        if (uiHtml && uiUri) {
          content.push({
            type: "resource" as const,
            resource: { uri: uiUri, mimeType: uiMime, text: uiHtml },
          });
        }
        return {
          content: content as never,
          structuredContent: validateOutput(tool.name, {
            status: "ok",
            ...publicResult,
            ...(echoToken ? { room_token: echoToken } : {}),
          }),
        };

      } catch (error) {
        const { newCorrelationId } = await import("@/lib/core/access.server");
        console.error("[room-tool]", tool.name, error);
        const roomError = toRoomError(error);

        // Plan and limit errors are answered as helpful upgrade content,
        // never as a technical exception.
        if (roomError.code === "PLAN_REQUIRED" || roomError.code === "LIMIT_REACHED") {
          const { buildUpgradePayload, detectLanguage } = await import("@/lib/entitlements/upgrade.server");
          const { resolvePlanContext } = await import("@/lib/entitlements/guard.server");
          const ctx = await resolvePlanContext(token, knownSubjectHash, session);
          const details = roomError.details as {
            max?: number;
            current?: number;
            limit?: string;
            required_plan?: string;
            feature?: string;
          };
          const payload = await buildUpgradePayload({
            tool: tool.name,
            feature: details.feature ?? tool.title,
            currentPlan: ctx.plan,
            language: detectLanguage(rest),
            contextHash: ctx.subjectHash,
            correlationId: ctx.correlationId,
            ...(details.required_plan ? { requiredPlan: details.required_plan } : {}),
            ...(roomError.code === "LIMIT_REACHED" && typeof details.max === "number"

              ? {
                  usage: {
                    used: typeof details.current === "number" ? details.current : details.max,
                    max: details.max,
                    unit: String(details.limit ?? "items"),
                  },
                }
              : {}),
          });
          return {
            content: [
              { type: "text" as const, text: `${payload.message}\n\n${payload.cta_label}: ${payload.upgrade_url}` },
            ],
            structuredContent: validateOutput(tool.name, {
              status: roomError.code === "LIMIT_REACHED" ? "limit_reached" : "upgrade_required",
              retryable: false,
              ...payload,
              ...(echoToken ? { room_token: echoToken } : {}),
            }),
          };
        }

        return {
          isError: true,
          content: [{ type: "text" as const, text: roomError.message }],
          structuredContent: validateOutput(tool.name, {
            status: "error",
            code: roomError.code,
            message: roomError.message,
            retryable: roomError.code === "IDENTITY_UNAVAILABLE",
            ...(echoToken ? { room_token: echoToken } : {}),
            correlation_id: newCorrelationId(),
          }),
        };

      }
    },
  });
}


const ALL_ROOM_TOOLS = [
  ...(TOOLS as unknown as RoomTool[]),
  ...(PERSONAL_TOOLS as unknown as RoomTool[]),
  ...(PLUS_TOOLS as unknown as RoomTool[]),
  ...(PROFILE_TOOLS as unknown as RoomTool[]),
  ...(MATCH_TOOLS as unknown as RoomTool[]),
  ...(SOCIAL_TOOLS as unknown as RoomTool[]),
  ...(SUGAR_TOOLS as unknown as RoomTool[]),
  ...(LOVE_TOOLS as unknown as RoomTool[]),
];

const seen = new Set<string>();
export const roomTools = ALL_ROOM_TOOLS.filter((tool) => {
  if (seen.has(tool.name)) return false;
  seen.add(tool.name);
  return true;
}).map(adapt);
