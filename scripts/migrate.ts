/**
 * DSQL migration runner. Aurora DSQL forbids mixing DDL + DML in a transaction and allows only
 * ONE DDL statement per transaction, and builds indexes asynchronously. So we cannot use a
 * normal multi-statement migration file in one txn. This runner:
 *   1. reads every drizzle/*.sql file in order,
 *   2. splits it into individual statements,
 *   3. executes each statement on its own (each runs in its own implicit txn).
 * "Already exists" errors (duplicate table/index) are tolerated so re-runs are safe.
 *
 * Run BEFORE any traffic: `pnpm run db:migrate`. Never during the demo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "../lib/db/region-router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

// Duplicate-object SQLSTATEs we treat as idempotent no-ops.
const DUPLICATE_OBJECT = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (index/constraint)
  "42P06", // duplicate_schema
]);

/** Split a SQL file into statements on `;` boundaries, stripping `--` line comments. */
function splitStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No .sql migrations found in drizzle/.");
    return;
  }

  const pool = getPool("primary");
  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const statements = splitStatements(sql);
    console.log(`\n→ ${file}: ${statements.length} statement(s)`);

    for (const stmt of statements) {
      const label = stmt.replace(/\s+/g, " ").slice(0, 70);
      try {
        await pool.query(stmt);
        applied++;
        console.log(`  ✓ ${label}`);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code && DUPLICATE_OBJECT.has(code)) {
          skipped++;
          console.log(`  ⏭  exists, skipped: ${label}`);
          continue;
        }
        console.error(`  ✗ FAILED: ${label}\n     ${(err as Error).message}`);
        throw err;
      }
    }
  }

  console.log(
    `\nMigration complete: ${applied} applied, ${skipped} already existed.\n` +
      `⚠️  HARD GATE: DSQL builds indexes ASYNC. The UNIQUE indexes\n` +
      `   (uq_trade_idempotency_realm_idem, uq_trades_realm_idem) are the structural\n` +
      `   exactly-once guard — they are what makes a replayed/raced trade dedupe instead of\n` +
      `   double-settling. Do NOT seed or run the storm until they are ACTIVE — check the Aurora\n` +
      `   DSQL console (or wait ~30s for this tiny schema).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
