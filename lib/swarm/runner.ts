import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { failoverTo, getActiveRegion, getPool } from "../db/region-router";
import { DEMO, poolKeyToRegion } from "../demo/config";
import { executeTrade } from "../kernel/trade";
import { KernelError, type OwnerType, type Region, type TradeRequest } from "../types";

/**
 * THE DUPE-ATTACK SWARM — fires thousands of concurrent trades at the ONE legendary (and at the
 * whale's gold hoard) through the real `executeTrade` kernel, to force genuine Aurora DSQL OCC
 * (40001) contention while proving the structural invariants hold: the legendary stays exactly ONE
 * row with ONE owner (every duplicate attempt declines ITEM_MOVED), and gold is conserved to the
 * minor unit across every concurrent debit.
 *
 * No mocking — every job is a real kernel call. OCC retries are surfaced via `snap.attempts`.
 */

const SQL_LEGENDARY_ROW = `
  SELECT owner_type, owner_id, region, version
    FROM item_instances WHERE instance_id = $1`;
const SQL_LEGENDARY_COUNT = `SELECT count(*)::int AS n FROM item_instances WHERE template_id = $1`;
const SQL_GOLD_SUPPLY = `
  SELECT COALESCE(sum(balance_minor),0)::text AS n
    FROM currency_shards WHERE realm_id = $1 AND currency = $2`;
const SQL_MARKET_ITEMS = `
  SELECT instance_id, owner_type, owner_id, version
    FROM item_instances
   WHERE realm_id = $1 AND template_id <> $2
   LIMIT $3`;

function opposite(region: Region): Region {
  return region === "TOKYO" ? "SEOUL" : "TOKYO";
}

// ─────────────────────────────────────────────────────────────────────────────
// Dupe storm — many bots, exactly ONE legendary.
// ─────────────────────────────────────────────────────────────────────────────

export interface DupeStormOptions {
  attempts: number;
  concurrency: number;
  waves: number;
  dropRate: number;
  crossRegionRate: number;
  failoverAfterMs?: number;
}

export interface DupeStormReport {
  attempts: number;
  settled: number;
  dupeBlocked: number;
  dropsWon: number;
  crossRegionAttempts: number;
  crossRegionBlocked: number;
  retriesTotal: number;
  maxAttemptsSeen: number;
  conflictExhausted: number;
  errors: number;
  durationMs: number;
  settlesPerSec: number;
  legendaryCountAfter: number;
  legendaryFinalOwner: string;
  legendaryFinalRegion: Region;
  committedByRegion: Record<string, number>;
  activeRegion: Region;
  failoverFired: boolean;
}

interface DupeJob {
  req: TradeRequest;
  isCross: boolean;
}

export async function runDupeStorm(opts: Partial<DupeStormOptions> = {}): Promise<DupeStormReport> {
  const merged: DupeStormOptions = {
    attempts: opts.attempts ?? DEMO.swarm.attempts,
    concurrency: opts.concurrency ?? DEMO.swarm.concurrency,
    waves: opts.waves ?? DEMO.swarm.waves,
    dropRate: opts.dropRate ?? DEMO.swarm.dropRate,
    crossRegionRate: opts.crossRegionRate ?? DEMO.swarm.crossRegionRate,
    failoverAfterMs: opts.failoverAfterMs,
  };

  const primary = getPool("primary");
  const limit = pLimit(merged.concurrency);
  const waves = Math.max(1, merged.waves);
  const perWave = Math.max(1, Math.floor(merged.attempts / waves));

  let attemptsFired = 0;
  let settled = 0;
  let dupeBlocked = 0;
  let dropsWon = 0;
  let crossRegionAttempts = 0;
  let crossRegionBlocked = 0;
  let retriesTotal = 0;
  let maxAttemptsSeen = 0;
  let conflictExhausted = 0;
  let errors = 0;
  const committedByRegion: Record<string, number> = {};
  let failoverFired = false;

  // Warm each endpoint SEQUENTIALLY before the burst: the first checkout resolves (and caches) the
  // DSQL credentials via one STS call, so the concurrent burst that follows signs locally with the
  // cached creds — no DNS stampede. (Memoization lives in createDsqlPool; see lib/db/dsql.ts.) This
  // also readies the post-failover region instantly and removes cold-start skew on the early waves.
  await getPool("primary").query("SELECT 1");
  await getPool("secondary").query("SELECT 1");

  const start = Date.now();

  // Schedule the mid-swarm region failover, if requested (the multi-region survivor demo).
  let failoverTimer: ReturnType<typeof setTimeout> | undefined;
  if (merged.failoverAfterMs && merged.failoverAfterMs > 0) {
    failoverTimer = setTimeout(() => {
      failoverTo("secondary");
      failoverFired = true;
    }, merged.failoverAfterMs);
  }

  for (let w = 0; w < waves; w++) {
    // Read the legendary's CURRENT (owner, version) — EVERY job in this wave targets this exact
    // tuple, so exactly ONE can commit and the rest decline ITEM_MOVED.
    const cur = await primary.query(SQL_LEGENDARY_ROW, [DEMO.legendaryInstanceId]);
    const row = cur.rows[0];
    if (!row) break; // legendary missing (should never happen) — nothing to attack
    const fromOwnerType = String(row.owner_type) as OwnerType;
    const fromOwnerId = String(row.owner_id);
    const expectedVersion = Number(row.version);

    const jobs: DupeJob[] = [];
    for (let i = 0; i < perWave; i++) {
      const activeReg = poolKeyToRegion(getActiveRegion());
      const isCross = Math.random() < merged.crossRegionRate;
      const region: Region = isCross ? opposite(activeReg) : activeReg;
      if (isCross) crossRegionAttempts++;

      const isDrop = Math.random() < merged.dropRate;
      const toOwnerType: OwnerType = isDrop ? "WORLD" : "PLAYER";
      const toOwnerId = isDrop
        ? DEMO.worldOwnerId
        : Math.random() < 0.5
          ? `bot-${randomUUID().slice(0, 8)}`
          : DEMO.rivals[Math.floor(Math.random() * DEMO.rivals.length)];

      const req: TradeRequest = {
        realmId: DEMO.realmId,
        idempotencyKey: randomUUID(),
        kind: isDrop ? "DROP" : "TRADE",
        playerA: fromOwnerId,
        playerB: toOwnerId,
        itemLegs: [
          {
            instanceId: DEMO.legendaryInstanceId,
            expectedVersion,
            fromOwnerType,
            fromOwnerId,
            toOwnerType,
            toOwnerId,
          },
        ],
        goldLegs: [],
        currency: DEMO.currency,
        region,
      };
      jobs.push({ req, isCross });
    }
    attemptsFired += jobs.length;

    await Promise.all(
      jobs.map(({ req, isCross }) =>
        limit(async () => {
          try {
            const snap = await executeTrade(req);
            retriesTotal += Math.max(0, snap.attempts - 1);
            if (snap.attempts > maxAttemptsSeen) maxAttemptsSeen = snap.attempts;

            if (snap.outcome === "COMMITTED") {
              settled++;
              if (req.kind === "DROP") dropsWon++;
              committedByRegion[req.region] = (committedByRegion[req.region] ?? 0) + 1;
            } else {
              // DECLINED — the structural anti-dupe guard fired (the item already moved).
              if (snap.failureCode === "ITEM_MOVED") dupeBlocked++;
              if (isCross) crossRegionBlocked++;
            }
          } catch (err) {
            if (err instanceof KernelError && err.code === "RETRY_EXHAUSTED") {
              conflictExhausted++;
            } else {
              errors++;
            }
          }
        }),
      ),
    );
  }

  if (failoverTimer) clearTimeout(failoverTimer);
  const durationMs = Date.now() - start;

  // Final state — the headline proof: still EXACTLY ONE legendary, one owner, one region.
  const [countRes, finalRowRes] = await Promise.all([
    primary.query(SQL_LEGENDARY_COUNT, [DEMO.legendaryTemplateId]),
    primary.query(SQL_LEGENDARY_ROW, [DEMO.legendaryInstanceId]),
  ]);
  const legendaryCountAfter = Number(countRes.rows[0]?.n ?? 0);
  const finalRow = finalRowRes.rows[0] ?? {};

  return {
    attempts: attemptsFired,
    settled,
    dupeBlocked,
    dropsWon,
    crossRegionAttempts,
    crossRegionBlocked,
    retriesTotal,
    maxAttemptsSeen,
    conflictExhausted,
    errors,
    durationMs,
    settlesPerSec: durationMs > 0 ? settled / (durationMs / 1000) : 0,
    legendaryCountAfter,
    legendaryFinalOwner: String(finalRow.owner_id ?? ""),
    legendaryFinalRegion: (finalRow.region as Region) ?? DEMO.startRegion,
    committedByRegion,
    activeRegion: poolKeyToRegion(getActiveRegion()),
    failoverFired,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gold storm — concurrent double-spend of the whale's hoard; gold must be conserved.
// ─────────────────────────────────────────────────────────────────────────────

export interface GoldStormOptions {
  attempts: number;
  concurrency: number;
  unitMinor: number;
  failoverAfterMs?: number;
}

export interface GoldStormReport {
  attempts: number;
  transfersSettled: number;
  declinedInsufficient: number;
  retriesTotal: number;
  maxAttemptsSeen: number;
  conflictExhausted: number;
  errors: number;
  durationMs: number;
  transfersPerSec: number;
  goldSupplyBeforeMinor: number;
  goldSupplyAfterMinor: number;
  committedByRegion: Record<string, number>;
  activeRegion: Region;
  failoverFired: boolean;
}

export async function runGoldStorm(opts: Partial<GoldStormOptions> = {}): Promise<GoldStormReport> {
  const merged: GoldStormOptions = {
    attempts: opts.attempts ?? DEMO.gold.attempts,
    concurrency: opts.concurrency ?? DEMO.gold.concurrency,
    unitMinor: opts.unitMinor ?? DEMO.goldUnitMinor,
    failoverAfterMs: opts.failoverAfterMs,
  };

  const primary = getPool("primary");
  const limit = pLimit(merged.concurrency);

  let transfersSettled = 0;
  let declinedInsufficient = 0;
  let retriesTotal = 0;
  let maxAttemptsSeen = 0;
  let conflictExhausted = 0;
  let errors = 0;
  const committedByRegion: Record<string, number> = {};
  let failoverFired = false;

  // Warm sequentially so the cold credential resolve (one STS call) is cached before the burst.
  await getPool("primary").query("SELECT 1");
  if (merged.failoverAfterMs && merged.failoverAfterMs > 0) {
    await getPool("secondary").query("SELECT 1");
  }

  // Conserved-supply proof: read the total gold BEFORE the storm.
  const beforeRes = await primary.query(SQL_GOLD_SUPPLY, [DEMO.realmId, DEMO.currency]);
  const goldSupplyBeforeMinor = Number(beforeRes.rows[0]?.n ?? 0);

  const start = Date.now();

  let failoverTimer: ReturnType<typeof setTimeout> | undefined;
  if (merged.failoverAfterMs && merged.failoverAfterMs > 0) {
    failoverTimer = setTimeout(() => {
      failoverTo("secondary");
      failoverFired = true;
    }, merged.failoverAfterMs);
  }

  await Promise.all(
    Array.from({ length: merged.attempts }, () =>
      limit(async () => {
        // Region resolved at execution time so commits after a mid-storm failover route to and
        // are tallied against the surviving endpoint.
        const region = poolKeyToRegion(getActiveRegion());
        const req: TradeRequest = {
          realmId: DEMO.realmId,
          idempotencyKey: randomUUID(),
          kind: "TRADE",
          playerA: DEMO.whalePlayerId,
          playerB: DEMO.treasuryPlayerId,
          itemLegs: [],
          goldLegs: [
            {
              fromPlayerId: DEMO.whalePlayerId,
              toPlayerId: DEMO.treasuryPlayerId,
              amountMinor: merged.unitMinor,
            },
          ],
          currency: DEMO.currency,
          region,
        };
        try {
          const snap = await executeTrade(req);
          retriesTotal += Math.max(0, snap.attempts - 1);
          if (snap.attempts > maxAttemptsSeen) maxAttemptsSeen = snap.attempts;

          if (snap.outcome === "COMMITTED") {
            transfersSettled++;
            committedByRegion[req.region] = (committedByRegion[req.region] ?? 0) + 1;
          } else if (snap.failureCode === "INSUFFICIENT_FUNDS") {
            declinedInsufficient++;
          }
        } catch (err) {
          if (err instanceof KernelError && err.code === "RETRY_EXHAUSTED") {
            conflictExhausted++;
          } else {
            errors++;
          }
        }
      }),
    ),
  );

  if (failoverTimer) clearTimeout(failoverTimer);
  const durationMs = Date.now() - start;

  // Gold must be conserved to the minor unit — after MUST equal before.
  const afterRes = await primary.query(SQL_GOLD_SUPPLY, [DEMO.realmId, DEMO.currency]);
  const goldSupplyAfterMinor = Number(afterRes.rows[0]?.n ?? 0);

  return {
    attempts: merged.attempts,
    transfersSettled,
    declinedInsufficient,
    retriesTotal,
    maxAttemptsSeen,
    conflictExhausted,
    errors,
    durationMs,
    transfersPerSec: durationMs > 0 ? transfersSettled / (durationMs / 1000) : 0,
    goldSupplyBeforeMinor,
    goldSupplyAfterMinor,
    committedByRegion,
    activeRegion: poolKeyToRegion(getActiveRegion()),
    failoverFired,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Market storm — the MILLION-SCALE story. Thousands of INDEPENDENT item trades.
// Each job moves a DISTINCT item (its own row), so there is no hot row and no
// contention: throughput scales with concurrency. This is the linear-scale half of
// the world — a million players trading their own items is a million independent
// rows, not one. (Contrast: runDupeStorm is one hot row, deliberately serial.)
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketStormOptions {
  attempts: number;
  concurrency: number;
}

export interface MarketStormReport {
  attempts: number; // jobs actually fired (= distinct items loaded, ≤ requested)
  itemsAvailable: number;
  concurrency: number;
  settled: number;
  declined: number;
  retriesTotal: number;
  maxAttemptsSeen: number;
  conflictExhausted: number;
  errors: number;
  durationMs: number;
  settlesPerSec: number;
  committedByRegion: Record<string, number>;
  activeRegion: Region;
}

export async function runMarketStorm(
  opts: Partial<MarketStormOptions> = {},
): Promise<MarketStormReport> {
  const merged: MarketStormOptions = {
    attempts: opts.attempts ?? DEMO.market.storm.attempts,
    concurrency: opts.concurrency ?? DEMO.market.storm.concurrency,
  };

  const primary = getPool("primary");
  const limit = pLimit(merged.concurrency);
  const activeReg = poolKeyToRegion(getActiveRegion());

  // Load DISTINCT market items (excludes the legendary). Each job gets its own item, so no two
  // jobs ever touch the same row — the trades are genuinely independent and parallelize cleanly.
  const itemsRes = await primary.query(SQL_MARKET_ITEMS, [
    DEMO.realmId,
    DEMO.legendaryTemplateId,
    merged.attempts,
  ]);
  const items = itemsRes.rows;

  let settled = 0;
  let declined = 0;
  let retriesTotal = 0;
  let maxAttemptsSeen = 0;
  let conflictExhausted = 0;
  let errors = 0;
  const committedByRegion: Record<string, number> = {};

  const start = Date.now();
  await Promise.all(
    items.map((row) =>
      limit(async () => {
        const fromOwnerType = String(row.owner_type) as OwnerType;
        const fromOwnerId = String(row.owner_id);
        const toOwnerId = `bot-${randomUUID().slice(0, 8)}`;
        const req: TradeRequest = {
          realmId: DEMO.realmId,
          idempotencyKey: randomUUID(),
          kind: "TRADE",
          playerA: fromOwnerId,
          playerB: toOwnerId,
          itemLegs: [
            {
              instanceId: String(row.instance_id),
              expectedVersion: Number(row.version),
              fromOwnerType,
              fromOwnerId,
              toOwnerType: "PLAYER",
              toOwnerId,
            },
          ],
          goldLegs: [],
          currency: DEMO.currency,
          region: activeReg,
        };
        try {
          const snap = await executeTrade(req);
          retriesTotal += Math.max(0, snap.attempts - 1);
          if (snap.attempts > maxAttemptsSeen) maxAttemptsSeen = snap.attempts;
          if (snap.outcome === "COMMITTED") {
            settled++;
            committedByRegion[req.region] = (committedByRegion[req.region] ?? 0) + 1;
          } else {
            declined++;
          }
        } catch (err) {
          if (err instanceof KernelError && err.code === "RETRY_EXHAUSTED") conflictExhausted++;
          else errors++;
        }
      }),
    ),
  );
  const durationMs = Date.now() - start;

  return {
    attempts: items.length,
    itemsAvailable: items.length,
    concurrency: merged.concurrency,
    settled,
    declined,
    retriesTotal,
    maxAttemptsSeen,
    conflictExhausted,
    errors,
    durationMs,
    settlesPerSec: durationMs > 0 ? settled / (durationMs / 1000) : 0,
    committedByRegion,
    activeRegion: activeReg,
  };
}
