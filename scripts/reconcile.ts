/**
 * Duped reconciliation — THE correctness proof. Runs the shared invariant queries
 * (lib/world/invariants.ts) against the Aurora DSQL system of record and prints a clean PASS/FAIL
 * table the dashboard and demo video can read from. Exits non-zero if ANY CRITICAL invariant fails.
 *
 *   - a unique item is exactly one row with one owner   -> legendaryCount = 1, duplicates = 0
 *   - gold cannot be duplicated                          -> goldSupply = minted, ledgerDrift = 0
 *   - every gold transaction is balanced, no negatives   -> unbalancedTxns = 0, negativeShards = 0
 *
 * Run AFTER a storm: `pnpm run reconcile`. The invariant SQL is shared verbatim with the
 * `/api/world/proof` route, so the number on the dashboard is the number in this proof.
 */
import { getPool } from "../lib/db/region-router.js";
import { runInvariants } from "../lib/world/invariants.js";
import { DEMO, MINTED_GOLD_MINOR } from "../lib/demo/config.js";

async function main() {
  const pool = getPool("primary");
  const report = await runInvariants(pool);

  const line = "─".repeat(96);
  console.log(`\n${line}`);
  console.log("Duped Reconciliation Report — Aurora DSQL system of record (primary)");
  console.log(line);
  console.log(`  Realm            : ${DEMO.realmName} (${report.realmId})`);
  console.log(`  Legendary count  : ${report.legendaryCount}  (expect exactly 1)`);
  console.log(
    `  Gold supply      : ${report.goldSupplyMinor} minor  (minted ${MINTED_GOLD_MINOR}, ` +
      `drift ${report.goldSupplyMinor - MINTED_GOLD_MINOR})`,
  );
  console.log(`  Ledger drift     : ${report.ledgerDriftMinor} minor  (expect 0)`);
  console.log(`  Trades settled   : ${report.tradesSettled}`);
  console.log(`  Trades declined  : ${report.tradesDeclined}  (dupe / overspend attempts blocked)`);
  console.log(line);

  // Per-invariant table: tag | label | value vs expected, with the live SQL underneath.
  let failures = 0;
  for (const r of report.results) {
    const tag = r.pass ? "PASS" : "FAIL";
    const crit = r.critical ? "" : "  (informational)";
    if (!r.pass && r.critical) failures++;
    console.log(`  [${tag}] ${r.label}${crit}`);
    console.log(`         value=${r.value}   expected ${r.expected}`);
    console.log(`         SQL: ${r.sql}`);
  }
  console.log(line);

  if (report.allPass) {
    console.log("  ALL CRITICAL INVARIANTS HOLD — 0 dupes, gold conserved, $0 ledger drift.");
  } else {
    console.log(`  ${failures} CRITICAL INVARIANT FAILURE(S):`);
    for (const r of report.results.filter((x) => x.critical && !x.pass)) {
      console.log(`    ✗ ${r.label} — value=${r.value}, expected ${r.expected}`);
    }
  }
  console.log(`${line}\n`);

  await pool.end();
  if (!report.allPass) process.exit(1);
}

main().catch(async (err) => {
  console.error("Reconcile crashed:", err);
  process.exit(1);
});
