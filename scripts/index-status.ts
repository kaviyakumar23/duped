/**
 * Report Aurora DSQL async index build status for Duped. DSQL builds indexes ASYNC, so they must be
 * ACTIVE before traffic. The two UNIQUE idempotency indexes (uq_trades_realm_idem,
 * uq_trade_idempotency_realm_idem) are the structural exactly-once guard, and the item_instances
 * indexes back the version-guarded transfer that keeps the legendary one-owned. The full required
 * set comes from drizzle/0000_init.sql. Run: `pnpm db:index-status`.
 */
import { getPool } from "../lib/db/region-router.js";

const REQUIRED = [
  // item_instances — the version-guarded exactly-one-owner heart.
  "ix_item_instances_template",
  "ix_item_instances_owner",
  "ix_item_instances_realm",
  // item_templates / fungible stacks.
  "uq_item_templates_realm_code",
  "uq_currency_shards_player_currency_no",
  "ix_currency_shards_player_currency",
  "ix_currency_shards_currency",
  "uq_stack_holdings_player_template_no",
  // trades + trade_idempotency — the structural exactly-once dedupe.
  "uq_trades_realm_idem",
  "ix_trades_realm_created",
  "uq_trade_idempotency_realm_idem",
  // provenance / ledger / outbox.
  "ix_item_moves_instance",
  "ix_item_moves_realm_created",
  "ix_ledger_entries_txn",
  "ix_outbox_unpublished",
];

const pool = getPool("primary");

// pg_indexes lists an index once it exists; DSQL's sys.jobs (if present) shows build progress.
const { rows } = await pool.query(
  "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'",
);
const present = new Set(rows.map((r: { indexname: string }) => r.indexname));

let ready = 0;
for (const idx of REQUIRED) {
  const ok = present.has(idx);
  if (ok) ready++;
  console.log(`${ok ? "✓ ACTIVE " : "… pending"}  ${idx}`);
}
console.log(`\n${ready}/${REQUIRED.length} indexes present.`);

await pool.end();
process.exit(ready === REQUIRED.length ? 0 : 2);
