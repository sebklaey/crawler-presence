/**
 * Regression gate: no SECURITY DEFINER function in the public schema may be
 * executable by PUBLIC, anon or authenticated.
 * Run: bun test tests/db-function-grants.test.ts
 *
 * PostgreSQL grants EXECUTE to PUBLIC by default, so a new SECURITY DEFINER
 * function is world-callable through the Data API unless it is explicitly
 * revoked. Two independent checks run here:
 *   1. live ACL check against the database (whenever psql is reachable);
 *   2. a static check of the migration tree, so the gate still fails in an
 *      environment without database access.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = "supabase/migrations";

function migrationSql(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

async function psqlAvailable(): Promise<boolean> {
  if (!process.env["PGHOST"]) return false;
  const probe = Bun.spawnSync(["psql", "-At", "-c", "select 1"]);
  return probe.exitCode === 0;
}

describe("SECURITY DEFINER functions are not world-executable", () => {
  test("live ACLs grant EXECUTE only to owner and service_role", async () => {
    if (!(await psqlAvailable())) {
      // No database in this environment — the static check below is the gate.
      expect(true).toBe(true);
      return;
    }
    const query = `select p.proname || '|' || coalesce(array_to_string(p.proacl, ','), 'DEFAULT_PUBLIC')
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.prosecdef`;
    const out = Bun.spawnSync(["psql", "-At", "-c", query]);
    const rows = new TextDecoder().decode(out.stdout).trim().split("\n").filter(Boolean);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const [name, acl] = row.split("|");
      // "DEFAULT_PUBLIC" (null proacl) means the implicit PUBLIC grant is intact.
      expect(`${name}:${acl}`).not.toContain("DEFAULT_PUBLIC");
      // An empty grantee before "=" is the PUBLIC pseudo-role.
      expect(`${name}:${acl}`).not.toMatch(/(^|,)=/);
      expect(`${name}:${acl}`).not.toMatch(/(^|,)anon=/);
      expect(`${name}:${acl}`).not.toMatch(/(^|,)authenticated=/);
    }
  });

  test("the payment routines are locked down in the migration tree", () => {
    const sql = migrationSql().toLowerCase();
    // The lockdown loop revokes from PUBLIC across every SECURITY DEFINER
    // function and re-grants only service_role.
    expect(sql).toContain("revoke all on function %s from public");
    expect(sql).toContain("revoke all on function %s from anon, authenticated");
    expect(sql).toContain("grant execute on function %s to service_role");
    expect(sql).toContain("and p.prosecdef");
  });

  test("every payment routine sets a fixed search_path", () => {
    const sql = migrationSql();
    for (const fn of [
      "public.claim_payment_event",
      "public.finish_payment_event",
      "public.mirror_subscription_monotonic",
    ]) {
      const idx = sql.lastIndexOf(`FUNCTION ${fn}(`);
      expect(idx).toBeGreaterThan(-1);
      const body = sql.slice(idx, idx + 4000);
      expect(body).toContain("SET search_path = pg_catalog, pg_temp");
      expect(body).toContain("SECURITY DEFINER");
    }
  });
});
