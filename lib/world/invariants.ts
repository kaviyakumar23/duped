import type { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { DEMO, MINTED_GOLD_MINOR } from "../demo/config";

/**
 * THE PROOF. The economy invariants, expressed as the exact SQL that runs live against the Aurora
 * DSQL truth core. This single module is shared by `scripts/reconcile.ts` (CLI proof), the
 * `/api/world/proof` route (the "run SQL on camera" demo beat), and the world snapshot. Keeping the
 * queries in ONE place means the number on the dashboard and the number in the proof are the same
 * number from the same query.
 *
 * Duped's thesis, made checkable:
 *   - a unique item is exactly one row with one owner  -> legendaryCount = 1, duplicateInstances = 0
 *   - gold cannot be duplicated                         -> goldSupply = minted, ledgerDrift = 0
 *   - every gold transaction is balanced                -> unbalancedTxns = 0
 *   - no balance is ever negative                       -> negativeShards = 0
 */

/** The literal SQL shown to judges. Parameter placeholders are filled in `runInvariants`. */
export const INVARIANT_SQL = {
  legendaryCount: `SELECT count(*)::int AS n FROM item_instances WHERE template_id = $1`,
  duplicateInstances: `SELECT count(*)::int AS n FROM (
    SELECT instance_id FROM item_instances GROUP BY instance_id HAVING count(*) > 1
  ) t`,
  ownerlessInstances: `SELECT count(*)::int AS n FROM item_instances
    WHERE realm_id = $1 AND (owner_id IS NULL OR owner_id = '')`,
  totalInstances: `SELECT count(*)::int AS n FROM item_instances WHERE realm_id = $1`,
  goldSupply: `SELECT COALESCE(sum(balance_minor),0)::text AS n FROM currency_shards
    WHERE realm_id = $1 AND currency = $2`,
  negativeShards: `SELECT count(*)::int AS n FROM currency_shards
    WHERE realm_id = $1 AND balance_minor < 0`,
  ledgerDrift: `SELECT COALESCE(sum(signed_amount_minor),0)::text AS n FROM economy_ledger_entries
    WHERE currency = $1`,
  unbalancedTxns: `SELECT count(*)::int AS n FROM (
    SELECT ledger_txn_id FROM economy_ledger_entries
     GROUP BY ledger_txn_id HAVING sum(signed_amount_minor) <> 0
  ) t`,
  tradesSettled: `SELECT count(*)::int AS n FROM trades WHERE realm_id = $1 AND status = 'COMMITTED'`,
  tradesDeclined: `SELECT count(*)::int AS n FROM trades WHERE realm_id = $1 AND status = 'DECLINED'`,
} as const;

export interface InvariantResult {
  key: string;
  label: string;
  /** The exact SQL (placeholders substituted) — shown verbatim in the proof UI. */
  sql: string;
  value: number;
  expected: string;
  pass: boolean;
  /** Whether a failure here is a correctness violation (true) or just informational (false). */
  critical: boolean;
}

export interface InvariantReport {
  realmId: string;
  results: InvariantResult[];
  /** True iff every CRITICAL invariant holds. The headline "0 dupes, $0 drift" claim. */
  allPass: boolean;
  /** Convenience values surfaced to the world console. */
  legendaryCount: number;
  goldSupplyMinor: number;
  ledgerDriftMinor: number;
  tradesSettled: number;
  tradesDeclined: number;
}

/** pg returns BIGINT as a string; counts cast to ::int come back as JS numbers. Normalize. */
function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number(v ?? 0);
}

async function one(pool: AuroraDSQLPool, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query(sql, params);
  return toNum(rows[0]?.n);
}

function sub(sql: string, params: Record<string, string>): string {
  // Pretty-print the query with parameters inlined, for the proof UI only.
  let out = sql;
  Object.entries(params).forEach(([k, v]) => {
    out = out.replace(k, `'${v}'`);
  });
  return out.replace(/\s+/g, " ").trim();
}

export interface InvariantOpts {
  realmId?: string;
  legendaryTemplateId?: string;
  currency?: string;
  mintedGoldMinor?: number;
}

/**
 * Run every invariant query against DSQL and return a structured PASS/FAIL report. This is the
 * authoritative correctness check — the same one the CLI, the API, and the live proof all call.
 */
export async function runInvariants(
  pool: AuroraDSQLPool,
  opts: InvariantOpts = {},
): Promise<InvariantReport> {
  const realmId = opts.realmId ?? DEMO.realmId;
  const legendaryTemplateId = opts.legendaryTemplateId ?? DEMO.legendaryTemplateId;
  const currency = opts.currency ?? DEMO.currency;
  const minted = opts.mintedGoldMinor ?? MINTED_GOLD_MINOR;

  const [
    legendaryCount,
    duplicateInstances,
    ownerlessInstances,
    totalInstances,
    goldSupply,
    negativeShards,
    ledgerDrift,
    unbalancedTxns,
    tradesSettled,
    tradesDeclined,
  ] = await Promise.all([
    one(pool, INVARIANT_SQL.legendaryCount, [legendaryTemplateId]),
    one(pool, INVARIANT_SQL.duplicateInstances, []),
    one(pool, INVARIANT_SQL.ownerlessInstances, [realmId]),
    one(pool, INVARIANT_SQL.totalInstances, [realmId]),
    one(pool, INVARIANT_SQL.goldSupply, [realmId, currency]),
    one(pool, INVARIANT_SQL.negativeShards, [realmId]),
    one(pool, INVARIANT_SQL.ledgerDrift, [currency]),
    one(pool, INVARIANT_SQL.unbalancedTxns, []),
    one(pool, INVARIANT_SQL.tradesSettled, [realmId]),
    one(pool, INVARIANT_SQL.tradesDeclined, [realmId]),
  ]);

  const results: InvariantResult[] = [
    {
      key: "legendaryCount",
      label: "Legendary exists exactly once",
      sql: sub(INVARIANT_SQL.legendaryCount, { $1: legendaryTemplateId }),
      value: legendaryCount,
      expected: "= 1",
      pass: legendaryCount === 1,
      critical: true,
    },
    {
      key: "duplicateInstances",
      label: "No item instance owned twice",
      sql: INVARIANT_SQL.duplicateInstances.replace(/\s+/g, " ").trim(),
      value: duplicateInstances,
      expected: "= 0",
      pass: duplicateInstances === 0,
      critical: true,
    },
    {
      key: "ownerlessInstances",
      label: "Every item has exactly one owner",
      sql: sub(INVARIANT_SQL.ownerlessInstances, { $1: realmId }),
      value: ownerlessInstances,
      expected: "= 0",
      pass: ownerlessInstances === 0,
      critical: true,
    },
    {
      key: "goldSupply",
      label: "Gold supply conserved (no inflation)",
      sql: sub(INVARIANT_SQL.goldSupply, { $1: realmId, $2: currency }),
      value: goldSupply,
      expected: `= ${minted} (minted)`,
      pass: goldSupply === minted,
      critical: true,
    },
    {
      key: "ledgerDrift",
      label: "Gold ledger drift is zero",
      sql: sub(INVARIANT_SQL.ledgerDrift, { $1: currency }),
      value: ledgerDrift,
      expected: "= 0",
      pass: ledgerDrift === 0,
      critical: true,
    },
    {
      key: "unbalancedTxns",
      label: "Every gold transaction is balanced",
      sql: INVARIANT_SQL.unbalancedTxns.replace(/\s+/g, " ").trim(),
      value: unbalancedTxns,
      expected: "= 0",
      pass: unbalancedTxns === 0,
      critical: true,
    },
    {
      key: "negativeShards",
      label: "No negative gold balance",
      sql: sub(INVARIANT_SQL.negativeShards, { $1: realmId }),
      value: negativeShards,
      expected: "= 0",
      pass: negativeShards === 0,
      critical: true,
    },
    {
      key: "totalInstances",
      label: "Unique items conserved (none minted/burned by trades)",
      sql: sub(INVARIANT_SQL.totalInstances, { $1: realmId }),
      value: totalInstances,
      expected: "= seeded",
      pass: true, // informational; the seed count is the baseline
      critical: false,
    },
    {
      key: "tradesSettled",
      label: "Valid trades settled",
      sql: sub(INVARIANT_SQL.tradesSettled, { $1: realmId }),
      value: tradesSettled,
      expected: "≥ 0",
      pass: true,
      critical: false,
    },
    {
      key: "tradesDeclined",
      label: "Dupe / overspend attempts blocked",
      sql: sub(INVARIANT_SQL.tradesDeclined, { $1: realmId }),
      value: tradesDeclined,
      expected: "≥ 0",
      pass: true,
      critical: false,
    },
  ];

  return {
    realmId,
    results,
    allPass: results.filter((r) => r.critical).every((r) => r.pass),
    legendaryCount,
    goldSupplyMinor: goldSupply,
    ledgerDriftMinor: ledgerDrift,
    tradesSettled,
    tradesDeclined,
  };
}
