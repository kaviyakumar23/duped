import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, DDB_TABLE } from "../db/ddb";
import { getPool } from "../db/region-router";
import { ddbKeys, ENTITY } from "../world/keys";

/**
 * Outbox projector — drains the transactional `world_outbox` (written INSIDE the trade commit txn
 * on Aurora DSQL) into the DynamoDB live world read model. NEVER runs inside the commit txn: the
 * kernel only writes the outbox row; this worker publishes it after the fact — the textbook
 * transactional-outbox pattern.
 *
 * DynamoDB is the DISPLAY plane only (the world dashboard: legendary location, settlement feed,
 * region health). The authoritative correctness proof is reconcile.ts reading DSQL — so
 * at-least-once delivery is acceptable. We make it converge anyway:
 *   - the EVENT-log PutItem is idempotent (attribute_not_exists guard) so replays don't duplicate
 *     feed rows;
 *   - the ITEM projection update is version-MONOTONIC (only advances) so reordered/replayed events
 *     never roll the legendary's location backwards;
 *   - the REALM projection counters are ADD-incremented ONLY when the EVENT put was NEW, making the
 *     cumulative counters exactly-once.
 *
 * Single-table layout (must match lib/world/keys.ts — the world reader uses the same keys):
 *   EVENT      pk=REALM#<realmId>  sk=EVENT#<createdAt>#<eventId>   the settlement feed
 *   ITEM proj  pk=REALM#<realmId>  sk=ITEM#<instanceId>            current owner/region/version
 *   REALM proj pk=REALM#<realmId>  sk=PROJECTION#REALM             cumulative counters
 */

/** One moved unique item, as the kernel writes it into the TRADE_SETTLED payload. */
interface MovedItemProjection {
  instanceId: string;
  toOwnerId: string;
  versionAfter: number;
}

/** Mirrors the JSON the kernel writes into world_outbox.payload (camelCase, minor units). */
interface OutboxPayload {
  tradeId: string;
  realmId: string;
  kind: string;
  region: "TOKYO" | "SEOUL";
  playerA: string;
  playerB: string;
  goldMovedMinor: number;
  movedItems: MovedItemProjection[];
  committedAt?: string;
}

interface OutboxRow {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: OutboxPayload;
  created_at: Date | string;
}

const SELECT_UNPUBLISHED = `
  SELECT event_id, aggregate_type, aggregate_id, event_type, payload, created_at
    FROM world_outbox
   WHERE published_at IS NULL
   ORDER BY created_at
   LIMIT $1`;

const MARK_PUBLISHED = `
  UPDATE world_outbox
     SET published_at = CURRENT_TIMESTAMP
   WHERE event_id = $1`;

const CONDITIONAL_CHECK_FAILED = "ConditionalCheckFailedException";

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Write the idempotent EVENT-log item. Returns true if this was a NEW write, false if the item
 * already existed (a reprocessed row). The boolean gates the REALM counters so an outbox row that
 * gets re-drained (e.g. a crash before MARK_PUBLISHED) cannot double-count.
 */
async function putEvent(row: OutboxRow, createdAt: string): Promise<boolean> {
  const realmId = row.payload.realmId;
  try {
    await ddb.send(
      new PutCommand({
        TableName: DDB_TABLE,
        Item: {
          pk: ddbKeys.realmPk(realmId),
          sk: ddbKeys.eventSk(createdAt, row.event_id),
          entity: ENTITY.EVENT,
          eventId: row.event_id,
          eventType: row.event_type,
          payload: row.payload,
          createdAt,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === CONDITIONAL_CHECK_FAILED) return false;
    throw err;
  }
}

/**
 * Advance the ITEM projection (the legendary's single live location) to this move's version.
 * Version-MONOTONIC: the update only applies when the projected version is absent or not ahead of
 * the incoming one, so a reordered/replayed event can never move the sword backwards. A losing
 * (stale) update fails its condition and is silently skipped — the projection stays converged.
 */
async function advanceItemProjection(
  realmId: string,
  region: OutboxPayload["region"],
  moved: MovedItemProjection,
  updatedAt: string,
): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: DDB_TABLE,
        Key: { pk: ddbKeys.realmPk(realmId), sk: ddbKeys.itemSk(moved.instanceId) },
        UpdateExpression:
          "SET ownerId = :owner, #region = :region, #version = :v, entity = :entity, updatedAt = :updatedAt",
        ConditionExpression: "attribute_not_exists(#version) OR #version <= :v",
        ExpressionAttributeNames: { "#region": "region", "#version": "version" },
        ExpressionAttributeValues: {
          ":owner": moved.toOwnerId,
          ":region": region,
          ":v": moved.versionAfter,
          ":entity": ENTITY.ITEM,
          ":updatedAt": updatedAt,
        },
      }),
    );
  } catch (err) {
    // A stale/reordered event lost the monotonic guard — that's expected; skip it.
    if ((err as { name?: string }).name === CONDITIONAL_CHECK_FAILED) return;
    throw err;
  }
}

/**
 * Bump the cumulative REALM counters (settlement totals + per-region tally). Called ONLY for a
 * first-time EVENT write, which makes these counters exactly-once. The per-region counter is chosen
 * by the settling region so the dashboard can show "TOKYO vs SEOUL" throughput.
 */
async function bumpRealmProjection(payload: OutboxPayload, updatedAt: string): Promise<void> {
  const regionCounter = payload.region === "TOKYO" ? "settledTokyo" : "settledSeoul";
  await ddb.send(
    new UpdateCommand({
      TableName: DDB_TABLE,
      Key: { pk: ddbKeys.realmPk(payload.realmId), sk: ddbKeys.realmProjectionSk() },
      UpdateExpression:
        `ADD tradesSettled :one, itemsMoved :nItems, goldMovedMinor :gold, ${regionCounter} :one ` +
        "SET entity = :entity, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":one": 1,
        ":nItems": payload.movedItems.length,
        ":gold": payload.goldMovedMinor,
        ":entity": ENTITY.REALM,
        ":updatedAt": updatedAt,
      },
    }),
  );
}

/**
 * Drain up to `batchSize` unpublished outbox rows into the DynamoDB world model and mark them
 * published. Returns the number of rows processed (0 when the outbox is drained).
 */
export async function projectOnce(batchSize = 100): Promise<number> {
  const pool = getPool("primary");
  const { rows } = await pool.query(SELECT_UNPUBLISHED, [batchSize]);

  for (const row of rows as OutboxRow[]) {
    const createdAt = toIso(row.created_at);
    const payload = row.payload;

    // (a) Idempotent settlement-feed event.
    const isNew = await putEvent(row, createdAt);

    if (row.event_type === "TRADE_SETTLED") {
      // (b) Advance each moved item's live location (monotonic; safe to repeat).
      for (const moved of payload.movedItems ?? []) {
        await advanceItemProjection(payload.realmId, payload.region, moved, createdAt);
      }
      // (c) Cumulative counters — exactly-once (only on a brand-new EVENT write).
      if (isNew) await bumpRealmProjection(payload, createdAt);
    }

    await pool.query(MARK_PUBLISHED, [row.event_id]);
  }

  return rows.length;
}
