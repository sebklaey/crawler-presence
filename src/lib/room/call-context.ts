/**
 * Per-call server context.
 *
 * The MCP adapter runs every handler inside this context so shared helpers can
 * tell a read from a write WITHOUT threading a flag through ~40 call sites.
 * A read-only call must never touch presence heartbeats, provision accounts,
 * rooms or wallets, move read cursors or create capabilities.
 *
 * AsyncLocalStorage (not a module-level flag) so interleaved concurrent
 * requests can never see each other's mode.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type CallContext = {
  /** true when the invoked tool declares readOnlyHint. */
  readOnly: boolean;
  toolName: string;
};

const storage = new AsyncLocalStorage<CallContext>();

export function runInCallContext<T>(context: CallContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

/** Defaults to false so code paths outside a tool call keep their behaviour. */
export function isReadOnlyCall(): boolean {
  return storage.getStore()?.readOnly === true;
}

export function currentToolName(): string | null {
  return storage.getStore()?.toolName ?? null;
}

/** Account id used for read-only entitlement resolution of an unprovisioned subject. */
export const UNPROVISIONED_ACCOUNT_ID = "00000000-0000-0000-0000-000000000000";
