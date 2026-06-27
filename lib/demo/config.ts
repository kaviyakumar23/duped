/**
 * Single source of truth for the Duped demo. Shared by seed, swarm, reconcile, and the world UI so
 * the "10,000 bots vs ONE legendary" story is consistent everywhere. Deterministic UUIDs let the
 * seeder, kernel, and swarm all reference the same rows without a discovery round-trip.
 */

import type { Region } from "../types";
import type { RegionKey } from "../db/region-router";

/** Region → DSQL pool key. TOKYO is the primary endpoint, SEOUL the secondary (peered cluster). */
export const REGION_POOL: Record<Region, RegionKey> = {
  TOKYO: "primary",
  SEOUL: "secondary",
};

export function regionToPoolKey(region: Region): RegionKey {
  return REGION_POOL[region];
}

export function poolKeyToRegion(key: RegionKey): Region {
  return key === "primary" ? "TOKYO" : "SEOUL";
}

export const REGIONS: Region[] = ["TOKYO", "SEOUL"];

export const DEMO = {
  realmId: "11111111-1111-4111-8111-111111111111",
  realmName: "Aetheria",

  // ── The single legendary. The whole demo: many bots, exactly ONE of these, ever. ──
  legendaryTemplateId: "22222222-2222-4222-8222-222222222222",
  legendaryCode: "AURORA_BLADE",
  legendaryName: "Aurora, the Last Legendary Blade",
  /** The one and only instance. count(*) WHERE template = legendary must always be exactly 1. */
  legendaryInstanceId: "a0000000-0000-4000-8000-000000000001",

  // ── A common fungible template (model completeness: fungible vs unique protection). ──
  potionTemplateId: "33333333-3333-4333-8333-333333333333",
  potionCode: "GREATER_HEALTH_POTION",
  potionName: "Greater Health Potion",
  potionMaxStack: 999,

  currency: "GOLD",
  /** Display only: 1 gold = 100 minor (like cents). Balances/ledger are always minor units. */
  goldMinorPerUnit: 100,

  // ── Players ──
  /** Initial holder of the legendary (a world-boss drop). */
  founderPlayerId: "founder",
  founderHandle: "Aurelia_Vale",
  /** The gold whale — target of the double-spend storm. */
  whalePlayerId: "whale",
  whaleHandle: "GoldBaron",
  /** Gold sink for the double-spend scene (sharded so it's not a hot credit row). */
  treasuryPlayerId: "treasury",
  treasuryHandle: "Realm_Treasury",
  /** Named rivals who legitimately win the legendary in successive waves. */
  rivals: ["Kaelen", "Sora", "Driftwood", "Mirastra", "Volkov", "Nyx", "Renji", "Isolde"],

  /** Where the legendary first lives. */
  startRegion: "TOKYO" as Region,
  /** WORLD pseudo-owner id (drop target). owner_type='WORLD', owner_id=worldOwnerId. */
  worldOwnerId: "world:aetheria",

  // ── Gold (the whale's hoard + sharding) ──
  /** The whale's starting hoard, minor units. 600_000 minor = 6,000 gold. */
  whaleStartGoldMinor: 600_000,
  treasuryStartGoldMinor: 0,
  /** Gold is sharded across this many rows per player so no single balance row is hot. */
  goldShardCount: 64,
  /** Each gold double-spend attempt moves this much (minor). 100 = 1 gold. */
  goldUnitMinor: 100,

  // ── Fungible stack seed (light; model completeness only) ──
  potionStartQty: 1000,
  potionShardCount: 16,

  // ── Dupe-storm defaults (overridable via CLI flags / request body) ──
  swarm: {
    /** Total concurrent attacks on the legendary (the headline: ~10,000 vs ONE). */
    attempts: 10_000,
    /** Max in-flight attempts — drives genuine DSQL OCC (40001) contention. */
    concurrency: 200,
    /** Number of "waves": each wave reads the legendary's current (owner,version) and fires a
     *  burst at it. Exactly one attempt wins per wave (the legendary changes hands once); the rest
     *  are blocked with ITEM_MOVED. waves=1 ⇒ the purest "one winner out of 10,000" run. */
    waves: 8,
    /** Fraction of each wave's burst that attempts a DROP (PLAYER→WORLD) instead of a trade —
     *  the drop-and-relog vector. Still version-guarded, so it can't dupe either. */
    dropRate: 0.15,
    /** Fraction of each burst routed to the OPPOSITE region simultaneously — the cross-region
     *  simultaneous-trade vector. Both endpoints serialize against one logical DB; one wins. */
    crossRegionRate: 0.35,
  },

  // ── Gold double-spend defaults ──
  gold: {
    attempts: 10_000,
    concurrency: 200,
  },

  // ── The MARKETPLACE — the million-scale story. Thousands of ORDINARY unique items spread across
  // many players. A market trade moves a DISTINCT item (its own row), so trades are INDEPENDENT:
  // no hot row, no contention → throughput scales linearly with concurrency. This is the opposite
  // of the single-legendary scene (one hot row, deliberately serial to prove correctness). Together
  // they tell the whole story: correct under max contention AND scales out to millions. ──
  market: {
    itemCount: 1500, // ordinary unique items seeded across the market
    playerCount: 300, // traders who own them
    // A few non-legendary templates (each item is still a unique instance — exclusive ownership).
    templates: [
      { id: "44444444-4444-4444-8444-444444444444", code: "IRON_SWORD", name: "Iron Sword", rarity: "COMMON" },
      { id: "55555555-5555-4555-8555-555555555555", code: "OAKEN_SHIELD", name: "Oaken Shield", rarity: "RARE" },
      { id: "66666666-6666-4666-8666-666666666666", code: "EMBER_AMULET", name: "Ember Amulet", rarity: "EPIC" },
    ],
    storm: {
      attempts: 1500, // distinct items traded concurrently (capped to itemCount)
      concurrency: 100,
    },
    // Concurrency levels for the `--sweep` throughput demo (settles/sec should climb with each).
    sweep: [10, 25, 50, 100],
  },
} as const;

/** Deterministic-ish market player id (handle is "Trader_<i>"). owner_id is TEXT, so any id works. */
export function marketPlayerId(i: number): string {
  return `mkt-${String(i).padStart(4, "0")}`;
}

/**
 * Total gold minted at seed = the conserved supply. Only the whale (and the treasury, at 0) hold
 * gold, so SUM(currency_shards.balance_minor) for GOLD must equal this forever — the conservation
 * invariant. If you seed gold for other players, add it here so reconcile stays exact.
 */
export const MINTED_GOLD_MINOR = DEMO.whaleStartGoldMinor + DEMO.treasuryStartGoldMinor;

/** Even split of `total` across `count` shards (remainder spread over the first shards). */
export function evenSplit(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Per-shard starting gold (minor units), sharded so the whale is never a hot row under the storm. */
export function goldShardBalances(
  total: number = DEMO.whaleStartGoldMinor,
  count: number = DEMO.goldShardCount,
): number[] {
  return evenSplit(total, count);
}

/** Per-shard starting potion quantity (model completeness). */
export function potionShardQuantities(
  total: number = DEMO.potionStartQty,
  count: number = DEMO.potionShardCount,
): number[] {
  return evenSplit(total, count);
}
