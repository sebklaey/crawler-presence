/**
 * Deliberately non-fatal side work.
 *
 * Some steps must never break the operation that triggered them — analytics on
 * a public retrieval, alias sync after a successful publish, bookkeeping after
 * the user-visible effect already happened. Those failures are still failures,
 * so they are routed through here instead of an empty `catch {}`: the caller
 * keeps working, but the reason stays visible in the logs.
 */
function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Logs a swallowed failure of a step whose outcome does not affect the caller. */
export function logBestEffortFailure(context: string, error: unknown): void {
  console.error(`[crawler] best-effort step failed (${context})`, detail(error));
}

/**
 * Logs a swallowed failure that left persisted state inconsistent. Rethrowing
 * would be worse for the user (the primary effect already happened and cannot
 * be undone), so the operator needs a loud, greppable record instead.
 */
export function logInconsistentState(context: string, error: unknown, consequence: string): void {
  console.error(`[crawler] INCONSISTENT STATE (${context}) — ${consequence}:`, detail(error));
}

/** Runs a non-critical step and swallows — but logs — any failure. */
export async function bestEffort(context: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    logBestEffortFailure(context, error);
  }
}
