/**
 * Dupe-storm CLI — the live "wow" of the demo. Fires a horde of concurrent dupe attempts at the
 * ONE legendary (and, with --gold, a double-spend storm at the whale), all through the real
 * `executeTrade` kernel. Prints the aggregate evidence: the legendary count stays EXACTLY 1,
 * dupe attempts are blocked (ITEM_MOVED), and OCC 40001 retries are visibly non-zero.
 *
 *   pnpm storm --attempts 10000 --concurrency 200 --waves 8 --pool 50
 *   pnpm storm --gold --attempts 10000 --concurrency 200 --pool 50
 *   pnpm storm --attempts 10000 --failover-after-ms 1500     # region failover mid-storm
 *
 * CRITICAL: --pool sets DSQL_POOL_MAX in the env BEFORE the runner (and therefore the DSQL pool)
 * is imported, so the pool is built with the right max=connection ceiling that drives contention.
 */

interface Flags {
  attempts?: number;
  concurrency?: number;
  waves?: number;
  pool: number;
  dropRate?: number;
  crossRegionRate?: number;
  failoverAfterMs?: number;
  gold: boolean;
  market: boolean;
  sweep: boolean;
}

function parseFlags(argv: string[]): Flags {
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return undefined;
  };
  const num = (name: string): number | undefined => {
    const raw = get(name);
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${raw}"`);
    return n;
  };
  return {
    attempts: num("attempts"),
    concurrency: num("concurrency"),
    waves: num("waves"),
    pool: num("pool") ?? 50,
    dropRate: num("drop-rate"),
    crossRegionRate: num("cross-region-rate"),
    failoverAfterMs: num("failover-after-ms"),
    gold: argv.includes("--gold"),
    market: argv.includes("--market"),
    sweep: argv.includes("--sweep"),
  };
}

function printReport(title: string, rows: [string, string | number][]): void {
  const width = Math.max(...rows.map(([k]) => k.length));
  console.log(`  ┌─ ${title} ${"─".repeat(Math.max(0, 40 - title.length))}`);
  for (const [k, v] of rows) console.log(`  │ ${k.padEnd(width)} : ${v}`);
  console.log("  └────────────────────────────────────────────\n");
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));

  // For the scale sweep, ensure the pool ceiling covers the largest concurrency level.
  const poolMax = flags.market && flags.sweep ? Math.max(flags.pool, 100) : flags.pool;
  // MUST happen before the first getPool() so createDsqlPool reads the right pool ceiling.
  process.env.DSQL_POOL_MAX = String(poolMax);

  // Dynamic import AFTER env is set — load-bearing, do not hoist to a top-level import.
  const { runDupeStorm, runGoldStorm, runMarketStorm } = await import("../lib/swarm/runner.js");
  const { DEMO } = await import("../lib/demo/config.js");

  if (flags.market) {
    if (flags.sweep) {
      console.log("\n  Duped — MARKET SCALE SWEEP (independent item trades; throughput vs concurrency)");
      console.log(`  pool max (DSQL_POOL_MAX) : ${poolMax}\n`);
      for (const c of DEMO.market.sweep) {
        const r = await runMarketStorm({
          attempts: flags.attempts ?? DEMO.market.storm.attempts,
          concurrency: c,
        });
        console.log(
          `  concurrency ${String(c).padStart(4)} → ${String(r.settled).padStart(5)}/${r.attempts} settled ` +
            `in ${(r.durationMs / 1000).toFixed(2)}s = ${r.settlesPerSec.toFixed(0).padStart(5)} trades/sec ` +
            `(retries ${r.retriesTotal}, errors ${r.errors})`,
        );
      }
      console.log("\n  ↑ trades/sec climbs with concurrency — independent rows scale out (no hot row).");
      console.log("  Run `pnpm reconcile` — legendary still = 1, gold still conserved.\n");
      process.exit(0);
    }
    console.log("\n  Duped — MARKET STORM (thousands of INDEPENDENT item trades)");
    console.log(`  pool max (DSQL_POOL_MAX) : ${poolMax}`);
    console.log("  launching… (each trade moves a DISTINCT item — no hot row)\n");
    const r = await runMarketStorm({
      ...(flags.attempts !== undefined ? { attempts: flags.attempts } : {}),
      ...(flags.concurrency !== undefined ? { concurrency: flags.concurrency } : {}),
    });
    printReport("MARKET STORM REPORT", [
      ["items traded (attempts)", r.attempts],
      ["concurrency", r.concurrency],
      ["settled", r.settled],
      ["declined", r.declined],
      ["OCC retries observed", r.retriesTotal],
      ["max attempts (1 trade)", r.maxAttemptsSeen],
      ["errors", r.errors],
      ["duration", `${(r.durationMs / 1000).toFixed(2)}s`],
      ["THROUGHPUT (trades/sec)", r.settlesPerSec.toFixed(0)],
    ]);
    console.log("  independent trades, low contention → high throughput (vs the single legendary).");
    console.log("  Run `pnpm reconcile` — legendary still = 1, gold still conserved.\n");
    process.exit(0);
  }

  if (flags.gold) {
    console.log("\n  Duped — GOLD DOUBLE-SPEND storm (10k concurrent transfers from the whale)");
    console.log(`  pool max (DSQL_POOL_MAX) : ${flags.pool}`);
    console.log("  launching… (every transfer hits the real trade kernel)\n");

    const report = await runGoldStorm({
      ...(flags.attempts !== undefined ? { attempts: flags.attempts } : {}),
      ...(flags.concurrency !== undefined ? { concurrency: flags.concurrency } : {}),
      unitMinor: DEMO.goldUnitMinor,
      ...(flags.failoverAfterMs !== undefined ? { failoverAfterMs: flags.failoverAfterMs } : {}),
    });
    const conserved = report.goldSupplyBeforeMinor === report.goldSupplyAfterMinor;
    printReport("GOLD STORM REPORT", [
      ["attempts", report.attempts],
      ["transfers settled", report.transfersSettled],
      ["declined INSUFFICIENT_FUNDS", report.declinedInsufficient],
      ["OCC retries observed", report.retriesTotal],
      ["max attempts (1 transfer)", report.maxAttemptsSeen],
      ["errors", report.errors],
      ["duration", `${(report.durationMs / 1000).toFixed(2)}s`],
      ["transfers/sec", report.transfersPerSec.toFixed(1)],
      ["gold supply BEFORE (minor)", report.goldSupplyBeforeMinor],
      ["gold supply AFTER  (minor)", report.goldSupplyAfterMinor],
    ]);
    console.log(`  gold supply conserved : ${conserved ? "PASS ✓" : "DRIFT! ✗"}`);
    console.log(`  OCC retries > 0       : ${report.retriesTotal > 0 ? "PASS ✓" : "none (low contention)"}\n`);
    console.log("  Now run `pnpm reconcile` to prove supply conserved + ledger drift = 0.\n");
    process.exit(0);
  }

  console.log("\n  Duped — DUPE STORM (thousands of bots vs. ONE legendary)");
  console.log(`  pool max (DSQL_POOL_MAX) : ${flags.pool}`);
  console.log("  launching… (every attempt hits the real trade kernel)\n");

  const report = await runDupeStorm({
    ...(flags.attempts !== undefined ? { attempts: flags.attempts } : {}),
    ...(flags.concurrency !== undefined ? { concurrency: flags.concurrency } : {}),
    ...(flags.waves !== undefined ? { waves: flags.waves } : {}),
    ...(flags.dropRate !== undefined ? { dropRate: flags.dropRate } : {}),
    ...(flags.crossRegionRate !== undefined ? { crossRegionRate: flags.crossRegionRate } : {}),
    ...(flags.failoverAfterMs !== undefined ? { failoverAfterMs: flags.failoverAfterMs } : {}),
  });

  const rows: [string, string | number][] = [
    ["attempts fired", report.attempts],
    ["valid trades settled", report.settled],
    ["DUPE ATTEMPTS BLOCKED", report.dupeBlocked],
    ["drops won (PLAYER→WORLD)", report.dropsWon],
    ["cross-region attempts", report.crossRegionAttempts],
    ["cross-region blocked", report.crossRegionBlocked],
    ["OCC retries observed", report.retriesTotal],
    ["max attempts (1 trade)", report.maxAttemptsSeen],
    ["conflict exhausted", report.conflictExhausted],
    ["errors", report.errors],
    ["duration", `${(report.durationMs / 1000).toFixed(2)}s`],
    ["settles/sec", report.settlesPerSec.toFixed(1)],
    ["legendary count AFTER", report.legendaryCountAfter],
    ["legendary final owner", report.legendaryFinalOwner],
    ["legendary final region", report.legendaryFinalRegion],
    ["active region (end)", report.activeRegion],
  ];
  if (report.failoverFired || Object.keys(report.committedByRegion).length > 1) {
    rows.push(["failover fired", report.failoverFired ? "YES ⚡" : "no"]);
    rows.push([
      "settled by region",
      Object.entries(report.committedByRegion).map(([r, n]) => `${r}=${n}`).join("  "),
    ]);
  }
  printReport("DUPE STORM REPORT", rows);

  console.log(`  legendary count == 1 : ${report.legendaryCountAfter === 1 ? "PASS ✓ (never duped)" : `FAIL ✗ (${report.legendaryCountAfter})`}`);
  console.log(`  dupe attempts blocked: ${report.dupeBlocked}`);
  console.log(`  OCC retries > 0      : ${report.retriesTotal > 0 ? "PASS ✓" : "none (low contention)"}\n`);
  console.log("  Now run `pnpm reconcile` to prove legendary=1, owners/item=1, gold/ledger drift=0.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("storm failed:", err);
  process.exit(1);
});
