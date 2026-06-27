/**
 * Client-side type surface for the live world. The page renders a WorldSnapshot; we re-export the
 * authoritative shape from the backend read model via `import type` (erased at build — the client
 * bundle never pulls in pg / aws-sdk). Storm report shapes are defined here because they belong to
 * the API contract, not the read model.
 */
import type {
  WorldSnapshot,
  LegendaryState,
  FeedEvent,
  RegionHealth,
  WorldCounters,
} from "@/lib/world/read-model";
import type { InvariantReport, InvariantResult } from "@/lib/world/invariants";

export type { WorldSnapshot, LegendaryState, FeedEvent, RegionHealth, WorldCounters };
export type { InvariantReport, InvariantResult };

export type RegionCode = "TOKYO" | "SEOUL";

/** POST /api/world/storm → dupe-storm report. */
export interface StormReport {
  settled: number;
  dupeBlocked: number;
  dropsWon: number;
  crossRegionAttempts: number;
  crossRegionBlocked: number;
  retriesTotal: number;
  maxAttemptsSeen: number;
  conflictExhausted: number;
  durationMs: number;
  settlesPerSec: number;
  legendaryCountAfter: number;
  committedByRegion?: Record<string, number>;
  failoverFired?: boolean;
}

/** POST /api/world/market-storm → independent-trade throughput report (the linear-scale beat). */
export interface MarketStormReport {
  attempts: number;
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
  activeRegion: string;
}

/** POST /api/world/gold-storm → gold double-spend report. */
export interface GoldStormReport {
  transfersSettled: number;
  declinedInsufficient: number;
  retriesTotal: number;
  durationMs: number;
  goldSupplyBeforeMinor: number;
  goldSupplyAfterMinor: number;
}

export type ConnState = "connecting" | "live" | "polling" | "error";

/**
 * A safe, contract-shaped placeholder so the world NEVER blanks before the first snapshot arrives
 * (or if every data source is unreachable). count is 1 — the invariant holds even at rest.
 */
export const FALLBACK_SNAPSHOT: WorldSnapshot = {
  realmId: "11111111-1111-4111-8111-111111111111",
  realmName: "Aetheria",
  legendary: {
    instanceId: "a0000000-0000-4000-8000-000000000001",
    name: "Aurora, the Last Legendary Blade",
    rarity: "LEGENDARY",
    ownerType: "PLAYER",
    ownerId: "founder",
    ownerHandle: "Aurelia_Vale",
    region: "TOKYO",
    version: 0,
    count: 1,
  },
  invariants: {
    realmId: "11111111-1111-4111-8111-111111111111",
    results: [],
    allPass: true,
    legendaryCount: 1,
    goldSupplyMinor: 600000,
    ledgerDriftMinor: 0,
    tradesSettled: 0,
    tradesDeclined: 0,
  },
  counters: {
    tradesSettled: 0,
    tradesDeclined: 0,
    goldMovedMinor: 0,
    itemsMoved: 0,
    settledTokyo: 0,
    settledSeoul: 0,
  },
  regions: [
    { region: "TOKYO", settled: 0, active: true },
    { region: "SEOUL", settled: 0, active: false },
  ],
  feed: [],
  activeRegion: "TOKYO",
  generatedAt: new Date(0).toISOString(),
};
