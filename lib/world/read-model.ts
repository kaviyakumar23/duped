import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, DDB_TABLE } from "../db/ddb";
import { getActiveRegion, getPool, type RegionKey } from "../db/region-router";
import { DEMO, poolKeyToRegion } from "../demo/config";
import type { Region } from "../types";
import { ddbKeys } from "./keys";
import { runInvariants, type InvariantReport } from "./invariants";
import { projectOnce } from "../outbox/projector";

/**
 * The world read model. `getWorldSnapshot` is what the live arena + economy console render every
 * tick, and `getProof` is the "run the SQL on camera" beat. Both read the Aurora DSQL truth core
 * for the authoritative state (the legendary's single owner, the invariant board) and DynamoDB for
 * the live settlement feed — so the world visibly IS the backend state of BOTH databases.
 */

export interface LegendaryState {
  instanceId: string;
  name: string;
  rarity: string;
  ownerType: string;
  ownerId: string;
  ownerHandle: string;
  region: Region;
  version: number;
  /** Must be exactly 1, forever. The whole demo. */
  count: number;
}

export interface RegionHealth {
  region: Region;
  settled: number;
  active: boolean;
}

export interface FeedEvent {
  eventId: string;
  eventType: string;
  createdAt: string;
  kind: string;
  region: Region;
  playerA: string;
  playerB: string;
  goldMovedMinor: number;
  movedLegendary: boolean;
}

export interface WorldCounters {
  tradesSettled: number;
  tradesDeclined: number;
  goldMovedMinor: number;
  itemsMoved: number;
  settledTokyo: number;
  settledSeoul: number;
}

export interface WorldSnapshot {
  realmId: string;
  realmName: string;
  legendary: LegendaryState;
  invariants: InvariantReport;
  counters: WorldCounters;
  regions: RegionHealth[];
  feed: FeedEvent[];
  activeRegion: Region;
  generatedAt: string;
}

const SQL_LEGENDARY = `
  SELECT i.owner_type, i.owner_id, i.region, i.version, t.name, t.rarity
    FROM item_instances i
    JOIN item_templates t ON t.template_id = i.template_id
   WHERE i.instance_id = $1`;
const SQL_HANDLE = `SELECT handle FROM players WHERE player_id = $1`;
const SQL_BY_REGION = `
  SELECT region, count(*)::int AS n
    FROM trades WHERE realm_id = $1 AND status = 'COMMITTED' GROUP BY region`;
const SQL_GOLD_MOVED = `
  SELECT COALESCE(sum(gold_minor),0)::text AS n
    FROM trades WHERE realm_id = $1 AND status = 'COMMITTED'`;
const SQL_ITEMS_MOVED = `
  SELECT count(*)::int AS n FROM item_moves WHERE realm_id = $1 AND move_kind <> 'MINT'`;

function activeRegion(): Region {
  return poolKeyToRegion(getActiveRegion());
}

/** Read the live settlement feed from the DynamoDB world read model (newest first). */
async function readFeed(realmId: string, limit = 14): Promise<FeedEvent[]> {
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :ev)",
        ExpressionAttributeValues: {
          ":pk": ddbKeys.realmPk(realmId),
          ":ev": ddbKeys.eventPrefix(),
        },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map((it) => {
      const p = (it.payload ?? {}) as Record<string, unknown>;
      const movedItems = (p.movedItems ?? []) as Array<{ instanceId?: string }>;
      return {
        eventId: String(it.eventId ?? ""),
        eventType: String(it.eventType ?? ""),
        createdAt: String(it.createdAt ?? ""),
        kind: String(p.kind ?? ""),
        region: (p.region as Region) ?? "TOKYO",
        playerA: String(p.playerA ?? ""),
        playerB: String(p.playerB ?? ""),
        goldMovedMinor: Number(p.goldMovedMinor ?? 0),
        movedLegendary: movedItems.some((m) => m.instanceId === DEMO.legendaryInstanceId),
      };
    });
  } catch {
    // DynamoDB read-plane hiccup must never blank the world — degrade to an empty feed.
    return [];
  }
}

export async function getWorldSnapshot(realmId: string = DEMO.realmId): Promise<WorldSnapshot> {
  const pool = getPool("primary");

  // Project-on-read: opportunistically drain a batch of the transactional outbox into the DynamoDB
  // world feed on each snapshot, so the live feed self-populates while anyone is watching — no cron,
  // no background worker, works on any Vercel plan. Best-effort: a hiccup here must never blank the
  // world, and it runs concurrently with the DSQL reads below so it adds ~no latency. The next tick
  // (SSE ~1.5s or polling ~2s) drains the next batch.
  const drain = projectOnce(150).catch(() => 0);

  const [invariants, legRes, byRegionRes, goldRes, itemsRes] = await Promise.all([
    runInvariants(pool, { realmId }),
    pool.query(SQL_LEGENDARY, [DEMO.legendaryInstanceId]),
    pool.query(SQL_BY_REGION, [realmId]),
    pool.query(SQL_GOLD_MOVED, [realmId]),
    pool.query(SQL_ITEMS_MOVED, [realmId]),
  ]);
  await drain; // ensure just-projected settlements are visible in the feed read below
  const feed = await readFeed(realmId);

  const leg = legRes.rows[0] ?? {};
  const ownerId = String(leg.owner_id ?? DEMO.founderPlayerId);
  let ownerHandle = ownerId;
  if (leg.owner_type === "PLAYER") {
    const h = await pool.query(SQL_HANDLE, [ownerId]);
    ownerHandle = h.rows[0]?.handle ?? ownerId;
  } else if (leg.owner_type === "WORLD") {
    ownerHandle = "the world (dropped)";
  }

  const byRegion: Record<string, number> = {};
  for (const r of byRegionRes.rows) byRegion[String(r.region)] = Number(r.n);

  const counters: WorldCounters = {
    tradesSettled: invariants.tradesSettled,
    tradesDeclined: invariants.tradesDeclined,
    goldMovedMinor: Number(goldRes.rows[0]?.n ?? 0),
    itemsMoved: Number(itemsRes.rows[0]?.n ?? 0),
    settledTokyo: byRegion.TOKYO ?? 0,
    settledSeoul: byRegion.SEOUL ?? 0,
  };

  const active = activeRegion();
  const regions: RegionHealth[] = [
    { region: "TOKYO", settled: counters.settledTokyo, active: active === "TOKYO" },
    { region: "SEOUL", settled: counters.settledSeoul, active: active === "SEOUL" },
  ];

  return {
    realmId,
    realmName: DEMO.realmName,
    legendary: {
      instanceId: DEMO.legendaryInstanceId,
      name: String(leg.name ?? DEMO.legendaryName),
      rarity: String(leg.rarity ?? "LEGENDARY"),
      ownerType: String(leg.owner_type ?? "PLAYER"),
      ownerId,
      ownerHandle,
      region: (leg.region as Region) ?? DEMO.startRegion,
      version: Number(leg.version ?? 0),
      count: invariants.legendaryCount,
    },
    invariants,
    counters,
    regions,
    feed,
    activeRegion: active,
    generatedAt: new Date().toISOString(),
  };
}

/** The live SQL proof: run every invariant query and return the rows + PASS/FAIL for display. */
export async function getProof(realmId: string = DEMO.realmId): Promise<InvariantReport> {
  const pool = getPool("primary");
  return runInvariants(pool, { realmId });
}

export type { RegionKey };
