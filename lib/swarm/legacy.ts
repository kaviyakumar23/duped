import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { getPool } from "../db/region-router";
import { DEMO } from "../demo/config";
import { sleep } from "../kernel/retry";

/**
 * THE LEGACY (BROKEN) ECONOMY — the contrast demo. This is how a naive game moves an item: read
 * "does A own it?", then give it to B and take it from A as separate, unguarded steps. Under a
 * trade race, two concurrent transfers both pass the read, both INSERT a new owner, and the single
 * "take from A" only removes one row → the legendary ends up in TWO inventories. A real dupe, in a
 * real database, visible with `SELECT count(*) FROM legacy_inventory WHERE instance_id = …`.
 *
 * Duped's authoritative model (item_instances + version guard) makes this UNREPRESENTABLE — run the
 * same attack through executeTrade and the count never leaves 1. This module exists only to show,
 * on camera, exactly what Duped prevents. It is NOT part of the authoritative state or the invariants.
 */

const SQL = {
  ownerRow: `SELECT entry_id FROM legacy_inventory WHERE instance_id = $1 AND owner_id = $2 LIMIT 1`,
  insert: `INSERT INTO legacy_inventory (entry_id, realm_id, instance_id, owner_id) VALUES ($1,$2,$3,$4)`,
  deleteEntry: `DELETE FROM legacy_inventory WHERE entry_id = $1`,
  deleteAll: `DELETE FROM legacy_inventory WHERE instance_id = $1`,
  count: `SELECT count(*)::int AS n FROM legacy_inventory WHERE instance_id = $1`,
  owners: `SELECT owner_id FROM legacy_inventory WHERE instance_id = $1 ORDER BY created_at LIMIT 12`,
} as const;

export interface LegacyState {
  copies: number; // count of legacy_inventory rows for the legendary — should be 1, becomes >1 (duped)
  owners: string[]; // a few current "owners" (when duped, several players each think they hold it)
  duped: boolean;
}

export interface LegacyStormReport {
  attempts: number;
  copiesBefore: number;
  copiesAfter: number;
  duped: boolean;
  durationMs: number;
}

/** Live state of the broken economy: how many "copies" of the one legendary currently exist. */
export async function legacyState(): Promise<LegacyState> {
  const pool = getPool("primary");
  const [c, o] = await Promise.all([
    pool.query(SQL.count, [DEMO.legendaryInstanceId]),
    pool.query(SQL.owners, [DEMO.legendaryInstanceId]),
  ]);
  const copies = Number(c.rows[0]?.n ?? 0);
  return {
    copies,
    owners: o.rows.map((r) => String(r.owner_id)),
    duped: copies > 1,
  };
}

/** Collapse the broken economy back to a single, correct copy (founder owns it). Makes it re-runnable. */
export async function resetLegacy(): Promise<LegacyState> {
  const pool = getPool("primary");
  await pool.query(SQL.deleteAll, [DEMO.legendaryInstanceId]);
  await pool.query(SQL.insert, [
    randomUUID(),
    DEMO.realmId,
    DEMO.legendaryInstanceId,
    DEMO.founderPlayerId,
  ]);
  return legacyState();
}

/**
 * The naive transfer — NO transaction, NO version guard. Read who owns it, pause (the race window a
 * real game has: network + processing), then give to the new owner and remove the old row. Two of
 * these racing both read the same owner row and both insert → duplication.
 */
async function naiveTransfer(fromOwner: string, toOwner: string): Promise<void> {
  const pool = getPool("primary");
  const row = await pool.query(SQL.ownerRow, [DEMO.legendaryInstanceId, fromOwner]);
  if (row.rowCount === 0) return; // the giver doesn't (currently) hold it
  const entryId = row.rows[0].entry_id as string;
  // The race window — a real game has network + processing latency between checking ownership and
  // committing the move. Wide enough here that the concurrent attackers all read the same owner
  // BEFORE any of them removes the old row, so they all insert → the legendary multiplies.
  await sleep(250 + Math.floor(Math.random() * 250));
  await pool.query(SQL.insert, [randomUUID(), DEMO.realmId, DEMO.legendaryInstanceId, toOwner]); // give to B
  await pool.query(SQL.deleteEntry, [entryId]); // take from A — only one racer actually removes this row
}

/**
 * Fire the SAME attack the Duped kernel shrugs off, but through the broken model. The legendary's
 * single copy multiplies. Resets first so it's a clean, repeatable before/after.
 */
export async function runLegacyStorm(
  opts: { attempts?: number; concurrency?: number } = {},
): Promise<LegacyStormReport> {
  const attempts = opts.attempts ?? 20;
  const concurrency = opts.concurrency ?? 20;

  await resetLegacy();
  const before = (await legacyState()).copies;

  const limit = pLimit(concurrency);
  const start = Date.now();
  await Promise.all(
    Array.from({ length: attempts }, (_, i) =>
      limit(() =>
        naiveTransfer(DEMO.founderPlayerId, `bot-${randomUUID().slice(0, 8)}-${i}`).catch(() => {}),
      ),
    ),
  );
  const durationMs = Date.now() - start;
  const after = (await legacyState()).copies;

  return { attempts, copiesBefore: before, copiesAfter: after, duped: after > 1, durationMs };
}
