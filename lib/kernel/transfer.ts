import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { GoldLeg, ItemLeg, Region } from "../types";
import { shuffle } from "./retry";

/**
 * The structural anti-dupe primitive: a single version-guarded ownership transfer of one unique
 * item, plus the sharded conditional gold debit/credit. These run INSIDE the trade transaction
 * (kernel/trade.ts) — they never open their own transaction.
 *
 * Why two concurrent transfers of the same item can't both succeed: the move is a conditional
 * UPDATE that must match the item's CURRENT (owner_type, owner_id, version) and bumps version by 1.
 * The first to commit moves version 5→6; any concurrent transfer that also read version 5 either
 * sees the new version (row no longer matches → 0 rows → ITEM_MOVED) or conflicts at COMMIT
 * (SQLSTATE 40001 → retried, then re-reads and finds version 6 → ITEM_MOVED). Exactly one wins.
 * "Owned twice" is never representable in the authoritative row.
 */

const SQL = {
  transferInstance: `
    UPDATE item_instances
       SET owner_type = $1,
           owner_id   = $2,
           region     = $3,
           version    = version + 1,
           updated_at = CURRENT_TIMESTAMP
     WHERE instance_id = $4
       AND owner_type  = $5
       AND owner_id    = $6
       AND version     = $7
    RETURNING version`,
  instanceExists: `SELECT 1 FROM item_instances WHERE instance_id = $1`,
  insertMove: `
    INSERT INTO item_moves
      (move_id, realm_id, instance_id, trade_id, move_kind, from_owner_type, from_owner_id,
       to_owner_type, to_owner_id, from_region, to_region, version_after)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  loadGoldShards: `
    SELECT shard_id FROM currency_shards
     WHERE player_id = $1 AND currency = $2 AND balance_minor >= $3`,
  debitGoldShard: `
    UPDATE currency_shards
       SET balance_minor = balance_minor - $1, last_moved_at = CURRENT_TIMESTAMP
     WHERE shard_id = $2 AND balance_minor >= $1`,
  loadAnyShard: `SELECT shard_id FROM currency_shards WHERE player_id = $1 AND currency = $2 LIMIT 50`,
  creditGoldShard: `
    UPDATE currency_shards
       SET balance_minor = balance_minor + $1, last_moved_at = CURRENT_TIMESTAMP
     WHERE shard_id = $2`,
  insertShard: `
    INSERT INTO currency_shards (shard_id, realm_id, player_id, currency, balance_minor, shard_no, last_moved_at)
    VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`,
} as const;

export type ItemTransferResult =
  | { ok: true; versionAfter: number }
  | { ok: false; code: "ITEM_MOVED" | "ITEM_NOT_FOUND" };

/**
 * Apply one item leg as a version-guarded conditional UPDATE. rowCount must be exactly 1.
 * If 0, distinguish a genuinely-missing instance (ITEM_NOT_FOUND) from a raced one (ITEM_MOVED).
 */
export async function transferInstance(
  client: PoolClient,
  leg: ItemLeg,
  region: Region,
): Promise<ItemTransferResult> {
  const res = await client.query(SQL.transferInstance, [
    leg.toOwnerType,
    leg.toOwnerId,
    region,
    leg.instanceId,
    leg.fromOwnerType,
    leg.fromOwnerId,
    leg.expectedVersion,
  ]);
  if (res.rowCount === 1) {
    return { ok: true, versionAfter: Number(res.rows[0].version) };
  }
  // 0 rows: either the item doesn't exist, or its (owner, version) moved out from under us.
  const exists = await client.query(SQL.instanceExists, [leg.instanceId]);
  return { ok: false, code: exists.rowCount === 1 ? "ITEM_MOVED" : "ITEM_NOT_FOUND" };
}

/** Record one ownership change in the append-only provenance log (audit only). */
export async function recordMove(
  client: PoolClient,
  args: {
    moveId: string;
    realmId: string;
    instanceId: string;
    tradeId: string;
    moveKind: string;
    leg: ItemLeg;
    fromRegion: Region | null;
    toRegion: Region;
    versionAfter: number;
  },
): Promise<void> {
  await client.query(SQL.insertMove, [
    args.moveId,
    args.realmId,
    args.instanceId,
    args.tradeId,
    args.moveKind,
    args.leg.fromOwnerType,
    args.leg.fromOwnerId,
    args.leg.toOwnerType,
    args.leg.toOwnerId,
    args.fromRegion,
    args.toRegion,
    args.versionAfter,
  ]);
}

/**
 * Atomically debit one gold leg from a RANDOM shard of the payer that can cover the full amount,
 * then credit a random shard of the payee (sharded so neither side is a hot row under the storm).
 * Returns true on success; false ⇒ INSUFFICIENT_FUNDS (no single shard could cover the debit).
 *
 * Scope note (honest): a leg must fit within one shard's balance. Demo transfers are small (1 gold)
 * and the whale's hoard is spread across many shards, so this never binds. Arbitrarily large
 * transfers would split the debit across shards — out of scope for the demo, not a correctness gap.
 */
export async function moveGold(
  client: PoolClient,
  realmId: string,
  leg: GoldLeg,
  currency: string,
): Promise<boolean> {
  // 1) Debit: claim a random shard of the payer that still has enough.
  const debitable = shuffle(
    (await client.query(SQL.loadGoldShards, [leg.fromPlayerId, currency, leg.amountMinor])).rows.map(
      (r) => r.shard_id as string,
    ),
  );
  let debited = false;
  for (const shardId of debitable) {
    const claimed = await client.query(SQL.debitGoldShard, [leg.amountMinor, shardId]);
    if (claimed.rowCount === 1) {
      debited = true;
      break;
    }
  }
  if (!debited) return false; // INSUFFICIENT_FUNDS

  // 2) Credit: add to a random existing shard of the payee, or open a fresh shard if they have none.
  const payeeShards = shuffle(
    (await client.query(SQL.loadAnyShard, [leg.toPlayerId, currency])).rows.map(
      (r) => r.shard_id as string,
    ),
  );
  if (payeeShards.length > 0) {
    await client.query(SQL.creditGoldShard, [leg.amountMinor, payeeShards[0]]);
  } else {
    await client.query(SQL.insertShard, [
      randomUUID(),
      realmId,
      leg.toPlayerId,
      currency,
      leg.amountMinor,
      0,
    ]);
  }
  return true;
}
