/**
 * THE PROOF — the full Duped demo cycle, end to end, in one script. Run: `pnpm prove`.
 *
 *   (i)   reconcile baseline      — the seeded world is correct before any traffic
 *   (ii)  dupe storm + gold storm — thousands of concurrent bots attack ONE legendary and the
 *                                   whale's gold, forcing real Aurora DSQL OCC (40001) contention
 *   (iii) drain the projector     — publish the outbox into the DynamoDB world read model
 *   (iv)  reconcile               — prove every CRITICAL invariant is STILL literally zero/one
 *
 * The headline a judge can check: after the storm, the legendary still exists exactly once, gold
 * supply is unchanged, and the ledger drift is exactly 0. Correctness proven, not claimed.
 *
 * Seed first if you haven't: `pnpm db:seed` (this script does NOT reseed — it proves against the
 * live world). The swarm harness (lib/swarm/runner.ts) runs every attempt through the REAL kernel.
 */
import { getPool } from "../lib/db/region-router.js";
import { runInvariants } from "../lib/world/invariants.js";
import { projectOnce } from "../lib/outbox/projector.js";
import { runDupeStorm, runGoldStorm } from "../lib/swarm/runner.js";
import { DEMO, MINTED_GOLD_MINOR } from "../lib/demo/config.js";

const LINE = "═".repeat(80);

function header(n: string): void {
  console.log(`\n${LINE}\n  ${n}\n${LINE}`);
}

/** Print named headline fields when present, then dump the whole report so nothing is hidden. */
function printReport(report: Record<string, unknown>, fields: string[]): void {
  for (const f of fields) {
    if (report[f] !== undefined) {
      const v = report[f];
      console.log(`    ${f.padEnd(22)} = ${typeof v === "object" ? JSON.stringify(v) : v}`);
    }
  }
  console.log("    ── full report ──");
  console.dir(report, { depth: null });
}

async function reconcile(pool: ReturnType<typeof getPool>, label: string): Promise<boolean> {
  const report = await runInvariants(pool);
  console.log(`  ${label}:`);
  console.log(`    legendaryCount = ${report.legendaryCount} (expect 1)`);
  console.log(
    `    goldSupplyMinor = ${report.goldSupplyMinor} (minted ${MINTED_GOLD_MINOR}, ` +
      `drift ${report.goldSupplyMinor - MINTED_GOLD_MINOR})`,
  );
  console.log(`    ledgerDriftMinor = ${report.ledgerDriftMinor} (expect 0)`);
  console.log(`    tradesSettled = ${report.tradesSettled}, tradesDeclined = ${report.tradesDeclined}`);
  for (const r of report.results.filter((x) => x.critical)) {
    console.log(`    [${r.pass ? "PASS" : "FAIL"}] ${r.label} — value=${r.value}, expected ${r.expected}`);
  }
  console.log(`  -> ${report.allPass ? "ALL CRITICAL INVARIANTS HOLD" : "INVARIANT BREACH"}`);
  return report.allPass;
}

async function main() {
  const pool = getPool("primary");

  // ── (i) Baseline ────────────────────────────────────────────────────────────────────────
  header("(i) RECONCILE BASELINE — the seeded world before any traffic");
  await reconcile(pool, "baseline");

  // ── (ii) The storms ─────────────────────────────────────────────────────────────────────
  header("(ii) DUPE STORM — many bots, ONE legendary (real DSQL OCC contention)");
  const dupe = await runDupeStorm({ attempts: 600, concurrency: 50, waves: 3 });
  printReport(dupe as unknown as Record<string, unknown>, [
    "settled",
    "dupeBlocked",
    "retriesTotal",
    "legendaryCountAfter",
    "committedByRegion",
  ]);

  header("(ii) GOLD STORM — concurrent double-spend on the whale's hoard");
  const gold = await runGoldStorm({ attempts: 600, concurrency: 50, unitMinor: DEMO.goldUnitMinor });
  printReport(gold as unknown as Record<string, unknown>, [
    "transfersSettled",
    "declinedInsufficient",
    "goldSupplyBeforeMinor",
    "goldSupplyAfterMinor",
    "retriesTotal",
  ]);

  // ── (iii) Drain the outbox into the DynamoDB world read model ───────────────────────────
  header("(iii) PROJECT — drain world_outbox into the DynamoDB world model");
  let drained = 0;
  for (;;) {
    const n = await projectOnce();
    if (n === 0) break;
    drained += n;
    console.log(`    projected ${n} event(s) (total ${drained})`);
  }
  console.log(`  -> outbox drained: ${drained} event(s) published.`);

  // ── (iv) The proof ──────────────────────────────────────────────────────────────────────
  header("(iv) RECONCILE — prove correctness held under the storm");
  const ok = await reconcile(pool, "post-storm");

  console.log(`\n${LINE}`);
  console.log(
    `  ${ok ? "✓ CORRECTNESS PROVEN — 0 dupes, gold conserved, $0 drift, after the storm." : "✗ INVARIANT BREACH — see above."}`,
  );
  console.log(`${LINE}\n`);

  await pool.end();
  process.exit(ok ? 0 : 1);
}

main().catch(async (err) => {
  console.error("prove crashed:", err);
  process.exit(1);
});
