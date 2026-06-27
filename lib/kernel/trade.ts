import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool } from "../db/region-router";
import { regionToPoolKey } from "../demo/config";
import {
  KernelError,
  type MovedItem,
  type TradeFailureCode,
  type TradeRequest,
  type TradeSnapshot,
  isSerializationFailure,
} from "../types";
import { computeRequestHash } from "./hash";
import { buildGoldLedgerEntries, totalGoldMinor } from "./ledger";
import { MAX_TRADE_ATTEMPTS, jitteredBackoffMs, sleep } from "./retry";
import { moveGold, recordMove, transferInstance } from "./transfer";

/**
 * THE TRADE KERNEL — one idempotent, atomic transaction on Aurora DSQL that executes a two-sided
 * exchange of unique items and gold. It is the ONLY way the authoritative economy state changes.
 *
 * Guarantees, as long as every economic action goes through here (see CLAUDE.md §6/§7):
 *   - exactly-one-owner for every unique item (version-guarded transfer; "owned twice" can't exist)
 *   - conserved gold (sharded conditional debit/credit; balanced double-entry; no inflation)
 *   - all-or-nothing trades (every leg commits or the whole trade rolls back — no partial dupes)
 *   - exactly-once settlement (trade_idempotency keyed on (realm_id, idempotency_key))
 *   - global strong consistency (DSQL OCC: write conflicts surface as 40001 and are retried)
 *
 * The clause `WHERE owner_id = :from AND version = :expected` is the whole game: it makes
 * "move an item I no longer own" impossible to commit, so two concurrent trades on one item can
 * never both win — no race, no relog, no cross-region split-brain can duplicate it.
 */

const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

const SQL = {
  readRegistry: `
    SELECT request_hash, response_snapshot
      FROM trade_idempotency
     WHERE realm_id = $1 AND idempotency_key = $2`,
  insertTrade: `
    INSERT INTO trades
      (trade_id, realm_id, kind, player_a, player_b, idempotency_key, status, item_count,
       gold_minor, region, failure_code, request_hash, committed_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
  insertLedgerTxn: `
    INSERT INTO economy_ledger_transactions (ledger_txn_id, realm_id, trade_id, currency, description)
    VALUES ($1,$2,$3,$4,$5)`,
  insertLedgerEntry: `
    INSERT INTO economy_ledger_entries
      (entry_id, ledger_txn_id, line_no, player_id, currency, signed_amount_minor, trade_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`,
  insertRegistry: `
    INSERT INTO trade_idempotency
      (registry_id, realm_id, idempotency_key, request_hash, trade_id, final_status,
       response_snapshot, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
  insertOutbox: `
    INSERT INTO world_outbox (event_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES ($1,$2,$3,$4,$5)`,
} as const;

interface RegistryRow {
  request_hash: string;
  response_snapshot: TradeSnapshot;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION
  );
}

function validate(req: TradeRequest): void {
  const problems: string[] = [];
  if (!req.realmId) problems.push("realmId");
  if (!req.idempotencyKey) problems.push("idempotencyKey");
  if (req.region !== "TOKYO" && req.region !== "SEOUL") problems.push("region");
  if (!req.currency) problems.push("currency");
  if (req.itemLegs.length === 0 && req.goldLegs.length === 0) problems.push("legs(empty)");
  for (const l of req.itemLegs) {
    if (!l.instanceId) problems.push("itemLeg.instanceId");
    if (!Number.isInteger(l.expectedVersion) || l.expectedVersion < 0)
      problems.push("itemLeg.expectedVersion>=0");
  }
  for (const g of req.goldLegs) {
    if (!g.fromPlayerId || !g.toPlayerId) problems.push("goldLeg.player");
    if (!Number.isInteger(g.amountMinor) || g.amountMinor <= 0) problems.push("goldLeg.amount>0");
  }
  if (problems.length) {
    throw new KernelError("VALIDATION_ERROR", `Invalid trade request: ${problems.join(", ")}`);
  }
}

async function readRegistry(
  q: { query: (text: string, params: unknown[]) => Promise<{ rows: RegistryRow[] }> },
  realmId: string,
  key: string,
): Promise<RegistryRow | null> {
  const res = await q.query(SQL.readRegistry, [realmId, key]);
  return res.rows[0] ?? null;
}

/** Turn a stored registry row into a replay response — or 409 if the payload differs. */
function replayFrom(existing: RegistryRow, requestHash: string): TradeSnapshot {
  if (existing.request_hash !== requestHash) {
    throw new KernelError(
      "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
      "Idempotency key was reused with a different request payload.",
    );
  }
  return { ...existing.response_snapshot, replayed: true };
}

function declineSnapshot(
  req: TradeRequest,
  tradeId: string,
  failureCode: TradeFailureCode,
  attempts: number,
): TradeSnapshot {
  return {
    outcome: "DECLINED",
    tradeId,
    realmId: req.realmId,
    idempotencyKey: req.idempotencyKey,
    kind: req.kind,
    playerA: req.playerA,
    playerB: req.playerB,
    region: req.region,
    movedItems: [],
    goldMovedMinor: 0,
    failureCode,
    attempts,
    replayed: false,
  };
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* connection may already be aborted; ignore */
  }
}

/**
 * Record a deterministic decline on the SAME client (the main txn was just rolled back). Same
 * connection avoids a second pool checkout (which would risk pool-exhaustion deadlock under
 * same-key contention). Handles the race where a concurrent attempt with the same key wins.
 */
async function recordDecline(
  client: PoolClient,
  req: TradeRequest,
  requestHash: string,
  failureCode: TradeFailureCode,
  attempts: number,
): Promise<TradeSnapshot> {
  const tradeId = randomUUID();
  const snapshot = declineSnapshot(req, tradeId, failureCode, attempts);
  try {
    await client.query("BEGIN");
    const existing = await readRegistry(client, req.realmId, req.idempotencyKey);
    if (existing) {
      await client.query("ROLLBACK");
      return replayFrom(existing, requestHash);
    }
    await client.query(SQL.insertTrade, [
      tradeId, req.realmId, req.kind, req.playerA, req.playerB, req.idempotencyKey,
      "DECLINED", req.itemLegs.length, totalGoldMinor(req.goldLegs), req.region, failureCode,
      requestHash, null,
    ]);
    await client.query(SQL.insertRegistry, [
      randomUUID(), req.realmId, req.idempotencyKey, requestHash, tradeId, "DECLINED",
      JSON.stringify(snapshot), new Date(Date.now() + REGISTRY_TTL_MS).toISOString(),
    ]);
    await client.query("COMMIT");
    return snapshot;
  } catch (err) {
    await safeRollback(client);
    if (isUniqueViolation(err)) {
      const existing = await readRegistry(client, req.realmId, req.idempotencyKey);
      if (existing) return replayFrom(existing, requestHash);
    }
    throw err;
  }
}

export async function executeTrade(req: TradeRequest): Promise<TradeSnapshot> {
  validate(req);
  const requestHash = computeRequestHash(req);
  const pool = getPool(regionToPoolKey(req.region));

  for (let attempt = 1; attempt <= MAX_TRADE_ATTEMPTS; attempt++) {
    // 1) Replay-safe idempotency check (cheap, pre-transaction).
    const pre = await readRegistry(pool, req.realmId, req.idempotencyKey);
    if (pre) return replayFrom(pre, requestHash);

    // Fresh trade id PER ATTEMPT — a local, never shared (this kernel runs massively concurrently).
    const tradeId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 2) Transfer every UNIQUE item leg — version-guarded. Any miss aborts the WHOLE trade
      //    (atomic): no partial ownership change, so a half-finished trade can't dupe.
      const movedItems: MovedItem[] = [];
      const committedLegs: Array<{ leg: TradeRequest["itemLegs"][number]; versionAfter: number }> = [];
      let itemFailure: TradeFailureCode | null = null;
      for (const leg of req.itemLegs) {
        const result = await transferInstance(client, leg, req.region);
        if (!result.ok) {
          itemFailure = result.code; // ITEM_MOVED or ITEM_NOT_FOUND
          break;
        }
        movedItems.push({
          instanceId: leg.instanceId,
          fromOwnerId: leg.fromOwnerId,
          toOwnerId: leg.toOwnerId,
          versionAfter: result.versionAfter,
        });
        committedLegs.push({ leg, versionAfter: result.versionAfter });
      }
      if (itemFailure) {
        await client.query("ROLLBACK");
        return await recordDecline(client, req, requestHash, itemFailure, attempt);
      }

      // 3) Move every GOLD leg — sharded conditional debit + credit. Any shortfall aborts.
      let goldFailure: TradeFailureCode | null = null;
      for (const leg of req.goldLegs) {
        const ok = await moveGold(client, req.realmId, leg, req.currency);
        if (!ok) {
          goldFailure = "INSUFFICIENT_FUNDS";
          break;
        }
      }
      if (goldFailure) {
        await client.query("ROLLBACK"); // frees any item transfers above — all-or-nothing
        return await recordDecline(client, req, requestHash, goldFailure, attempt);
      }

      // 4) Record trade + provenance + balanced ledger + idempotency + outbox — all one txn.
      const goldMoved = totalGoldMinor(req.goldLegs);
      const committedAt = new Date().toISOString();
      let ledgerTxnId: string | undefined;

      const snapshot: TradeSnapshot = {
        outcome: "COMMITTED",
        tradeId,
        realmId: req.realmId,
        idempotencyKey: req.idempotencyKey,
        kind: req.kind,
        playerA: req.playerA,
        playerB: req.playerB,
        region: req.region,
        movedItems,
        goldMovedMinor: goldMoved,
        attempts: attempt,
        replayed: false,
        committedAt,
      };

      await client.query(SQL.insertTrade, [
        tradeId, req.realmId, req.kind, req.playerA, req.playerB, req.idempotencyKey,
        "COMMITTED", req.itemLegs.length, goldMoved, req.region, null, requestHash, committedAt,
      ]);

      // Provenance log (audit only — uniqueness is the item_instances row, not this).
      for (const { leg, versionAfter } of committedLegs) {
        await recordMove(client, {
          moveId: randomUUID(),
          realmId: req.realmId,
          instanceId: leg.instanceId,
          tradeId,
          moveKind: req.kind,
          leg,
          fromRegion: null,
          toRegion: req.region,
          versionAfter,
        });
      }

      // Balanced double-entry over gold (only when gold actually moved).
      if (req.goldLegs.length > 0) {
        ledgerTxnId = randomUUID();
        snapshot.ledgerTxnId = ledgerTxnId;
        await client.query(SQL.insertLedgerTxn, [
          ledgerTxnId, req.realmId, tradeId, req.currency,
          `${req.kind} ${goldMoved} ${req.currency} (minor)`,
        ]);
        for (const e of buildGoldLedgerEntries(req.goldLegs, req.currency)) {
          await client.query(SQL.insertLedgerEntry, [
            e.entryId, ledgerTxnId, e.lineNo, e.playerId, e.currency, e.signedAmountMinor, tradeId,
          ]);
        }
      }

      await client.query(SQL.insertRegistry, [
        randomUUID(), req.realmId, req.idempotencyKey, requestHash, tradeId, "COMMITTED",
        JSON.stringify(snapshot), new Date(Date.now() + REGISTRY_TTL_MS).toISOString(),
      ]);
      await client.query(SQL.insertOutbox, [
        randomUUID(), "trade", tradeId, "TRADE_SETTLED",
        JSON.stringify({
          tradeId, realmId: req.realmId, kind: req.kind, region: req.region,
          playerA: req.playerA, playerB: req.playerB, goldMovedMinor: goldMoved,
          movedItems: movedItems.map((m) => ({
            instanceId: m.instanceId, toOwnerId: m.toOwnerId, versionAfter: m.versionAfter,
          })),
          committedAt,
        }),
      ]);

      await client.query("COMMIT");
      return snapshot;
    } catch (err) {
      await safeRollback(client);

      // A concurrent attempt with the same key won the unique index — return its outcome.
      if (isUniqueViolation(err)) {
        const existing = await readRegistry(client, req.realmId, req.idempotencyKey);
        if (existing) return replayFrom(existing, requestHash);
        continue; // rare: registry not yet visible, retry
      }
      // DSQL OCC conflict — back off and retry with the SAME key (safe; idempotent).
      if (isSerializationFailure(err)) {
        await sleep(jitteredBackoffMs(attempt));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  throw new KernelError(
    "RETRY_EXHAUSTED",
    `Trade exhausted ${MAX_TRADE_ATTEMPTS} attempts under OCC contention.`,
  );
}
