/**
 * Duped demo seeder. Lays down the single source-of-truth demo world (one realm, THE ONE legendary
 * blade, a sharded gold whale, a treasury sink, named rivals, and a light potion stack) so the
 * "10,000 bots vs ONE legendary" + "gold double-spend storm" runs have something to fight over.
 *
 * Why sharded gold matters for DSQL: a single `balance_minor = 600000` row would be a hot row and
 * every concurrent debit would collide at commit (SQLSTATE 40001 storm). Instead the whale's hoard
 * is split across `goldShardCount` rows keyed by a RANDOM UUID `shard_id`; the kernel debits a
 * randomized candidate shard via a conditional decrement, so writes spread out and OCC conflicts
 * stay rare. The legendary needs no sharding — it is a single version-guarded row by design.
 *
 * DSQL rules honored here:
 *  - Pure DML only (no DDL) — `scripts/migrate.ts` owns the schema. So the inserts are safe to wrap
 *    in a single BEGIN/COMMIT (retried on OCC 40001) for speed.
 *  - No foreign keys exist, so the DELETE reset order is irrelevant.
 *  - Money/gold is integer minor units; IDs are UUIDs (app-supplied); timestamps are TIMESTAMPTZ.
 *
 * Run BEFORE traffic: `pnpm run db:seed`. Idempotent — it wipes the demo tables first.
 */
import { randomUUID } from "node:crypto";
import {
  DEMO,
  MINTED_GOLD_MINOR,
  goldShardBalances,
  marketPlayerId,
  potionShardQuantities,
} from "../lib/demo/config.js";
import { getPool } from "../lib/db/region-router.js";

// Every Duped table (with its PK), wiped before reseeding. No FKs in DSQL, so order is arbitrary.
const TABLES: ReadonlyArray<readonly [string, string]> = [
  ["legacy_inventory", "entry_id"],
  ["world_outbox", "event_id"],
  ["trade_idempotency", "registry_id"],
  ["economy_ledger_entries", "entry_id"],
  ["economy_ledger_transactions", "ledger_txn_id"],
  ["item_moves", "move_id"],
  ["trades", "trade_id"],
  ["stack_holdings", "holding_id"],
  ["currency_shards", "shard_id"],
  ["item_instances", "instance_id"],
  ["item_templates", "template_id"],
  ["players", "player_id"],
  ["realms", "realm_id"],
];

// DSQL caps rows-modified-per-transaction (and has no TRUNCATE), so big tables (declined trades and
// registry rows pile up after a storm) must be cleared in batches under that limit.
const DELETE_BATCH = 2000;
const OCC = "40001";
type PgPool = ReturnType<typeof getPool>;

async function clearTable(pool: PgPool, table: string, pk: string): Promise<number> {
  let total = 0;
  for (;;) {
    let deleted = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await pool.query(
          `DELETE FROM ${table} WHERE ${pk} IN (SELECT ${pk} FROM ${table} LIMIT ${DELETE_BATCH})`,
        );
        deleted = res.rowCount ?? 0;
        break;
      } catch (err) {
        if ((err as { code?: string }).code === OCC && attempt < 12) {
          await new Promise((r) => setTimeout(r, 40 * attempt));
          continue;
        }
        throw err;
      }
    }
    total += deleted;
    if (deleted < DELETE_BATCH) break;
  }
  return total;
}

/** Run the full seed DML in one BEGIN/COMMIT, retried on OCC 40001 so a re-seed is reliable. */
async function seedTxn(pool: PgPool): Promise<void> {
  const goldBalances = goldShardBalances(); // whale: goldShardCount shards summing to whaleStartGold
  const treasuryBalances = goldShardBalances(DEMO.treasuryStartGoldMinor, DEMO.goldShardCount);
  const potionQtys = potionShardQuantities();

  // founder + whale + treasury, then the named rivals (alternating home region TOKYO/SEOUL).
  const players: Array<{ id: string; handle: string; home: string }> = [
    { id: DEMO.founderPlayerId, handle: DEMO.founderHandle, home: "TOKYO" },
    { id: DEMO.whalePlayerId, handle: DEMO.whaleHandle, home: "TOKYO" },
    { id: DEMO.treasuryPlayerId, handle: DEMO.treasuryHandle, home: "SEOUL" },
    ...DEMO.rivals.map((name, i) => ({
      id: name.toLowerCase(),
      handle: name,
      home: i % 2 === 0 ? "TOKYO" : "SEOUL",
    })),
  ];

  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("BEGIN");

      // 1. Realm.
      await pool.query(`INSERT INTO realms (realm_id, realm_name) VALUES ($1, $2)`, [
        DEMO.realmId,
        DEMO.realmName,
      ]);

      // 2. Players.
      for (const p of players) {
        await pool.query(
          `INSERT INTO players (player_id, realm_id, handle, home_region) VALUES ($1,$2,$3,$4)`,
          [p.id, DEMO.realmId, p.handle, p.home],
        );
      }

      // 3. Item templates — the unique legendary (not fungible, max_stack 1) and a fungible potion.
      await pool.query(
        `INSERT INTO item_templates
           (template_id, realm_id, code, name, rarity, fungible, max_stack)
         VALUES ($1,$2,$3,$4,'LEGENDARY',false,1)`,
        [DEMO.legendaryTemplateId, DEMO.realmId, DEMO.legendaryCode, DEMO.legendaryName],
      );
      await pool.query(
        `INSERT INTO item_templates
           (template_id, realm_id, code, name, rarity, fungible, max_stack)
         VALUES ($1,$2,$3,$4,'COMMON',true,$5)`,
        [DEMO.potionTemplateId, DEMO.realmId, DEMO.potionCode, DEMO.potionName, DEMO.potionMaxStack],
      );

      // 4. THE ONE legendary instance — exactly one row, owned by the founder, version 0.
      await pool.query(
        `INSERT INTO item_instances
           (instance_id, template_id, realm_id, owner_type, owner_id, region, version)
         VALUES ($1,$2,$3,'PLAYER',$4,$5,0)`,
        [
          DEMO.legendaryInstanceId,
          DEMO.legendaryTemplateId,
          DEMO.realmId,
          DEMO.founderPlayerId,
          DEMO.startRegion,
        ],
      );

      // 5. MINT provenance row for the legendary (a world-boss drop; from_* NULL).
      await pool.query(
        `INSERT INTO item_moves
           (move_id, realm_id, instance_id, trade_id, move_kind, from_owner_type, from_owner_id,
            to_owner_type, to_owner_id, from_region, to_region, version_after)
         VALUES ($1,$2,$3,NULL,'MINT',NULL,NULL,'PLAYER',$4,NULL,$5,0)`,
        [randomUUID(), DEMO.realmId, DEMO.legendaryInstanceId, DEMO.founderPlayerId, DEMO.startRegion],
      );

      // 6. Sharded gold — the whale's hoard split across many shards (never a hot row), and the
      //    treasury seeded at 0 across the same number of shards (the double-spend sink).
      for (let i = 0; i < goldBalances.length; i++) {
        await pool.query(
          `INSERT INTO currency_shards
             (shard_id, realm_id, player_id, currency, balance_minor, shard_no)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), DEMO.realmId, DEMO.whalePlayerId, DEMO.currency, goldBalances[i], i],
        );
      }
      for (let i = 0; i < treasuryBalances.length; i++) {
        await pool.query(
          `INSERT INTO currency_shards
             (shard_id, realm_id, player_id, currency, balance_minor, shard_no)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), DEMO.realmId, DEMO.treasuryPlayerId, DEMO.currency, treasuryBalances[i], i],
        );
      }

      // 6b. The BROKEN economy's starting state: one correct copy of the legendary (founder owns it).
      //     The contrast demo races naive transfers against this and watches it multiply. (Audit-only;
      //     not part of the authoritative state.)
      await pool.query(
        `INSERT INTO legacy_inventory (entry_id, realm_id, instance_id, owner_id) VALUES ($1,$2,$3,$4)`,
        [randomUUID(), DEMO.realmId, DEMO.legendaryInstanceId, DEMO.founderPlayerId],
      );

      // 7. Light fungible potion stack for the founder (model completeness: fungible vs unique).
      for (let i = 0; i < potionQtys.length; i++) {
        await pool.query(
          `INSERT INTO stack_holdings
             (holding_id, realm_id, player_id, template_id, quantity, shard_no)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), DEMO.realmId, DEMO.founderPlayerId, DEMO.potionTemplateId, potionQtys[i], i],
        );
      }

      await pool.query("COMMIT");
      return;
    } catch (err) {
      await pool.query("ROLLBACK").catch(() => {});
      if ((err as { code?: string }).code === OCC && attempt < 12) {
        await new Promise((r) => setTimeout(r, 40 * attempt));
        continue;
      }
      throw err;
    }
  }
}

/** Run a unit of DML in one BEGIN/COMMIT, retried on OCC 40001. */
async function runTxn(pool: PgPool, body: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("BEGIN");
      await body();
      await pool.query("COMMIT");
      return;
    } catch (err) {
      await pool.query("ROLLBACK").catch(() => {});
      if ((err as { code?: string }).code === OCC && attempt < 12) {
        await new Promise((r) => setTimeout(r, 40 * attempt));
        continue;
      }
      throw err;
    }
  }
}

// DSQL caps rows-modified-per-transaction (~3000); seed the market in chunks well under it.
const MARKET_CHUNK = 400;

/**
 * Seed the MARKETPLACE — thousands of ORDINARY unique items spread across many traders. Each item
 * is its own row with one owner (exactly like the legendary), so market trades are INDEPENDENT and
 * scale out. This is the "million-scale" half of the world; the legendary is the "stays correct
 * under max contention" half.
 */
async function seedMarket(pool: PgPool): Promise<{ players: number; items: number }> {
  const m = DEMO.market;

  // Templates + traders (a few hundred rows — one txn).
  await runTxn(pool, async () => {
    for (const t of m.templates) {
      await pool.query(
        `INSERT INTO item_templates (template_id, realm_id, code, name, rarity, fungible, max_stack)
         VALUES ($1,$2,$3,$4,$5,false,1)`,
        [t.id, DEMO.realmId, t.code, t.name, t.rarity],
      );
    }
    for (let i = 0; i < m.playerCount; i++) {
      await pool.query(
        `INSERT INTO players (player_id, realm_id, handle, home_region) VALUES ($1,$2,$3,$4)`,
        [marketPlayerId(i), DEMO.realmId, `Trader_${i}`, i % 2 === 0 ? "TOKYO" : "SEOUL"],
      );
    }
  });

  // Items in chunks (each a distinct instance owned by a trader, alternating region).
  let made = 0;
  for (let start = 0; start < m.itemCount; start += MARKET_CHUNK) {
    const end = Math.min(start + MARKET_CHUNK, m.itemCount);
    await runTxn(pool, async () => {
      for (let i = start; i < end; i++) {
        const tpl = m.templates[i % m.templates.length];
        await pool.query(
          `INSERT INTO item_instances
             (instance_id, template_id, realm_id, owner_type, owner_id, region, version)
           VALUES ($1,$2,$3,'PLAYER',$4,$5,0)`,
          [randomUUID(), tpl.id, DEMO.realmId, marketPlayerId(i % m.playerCount), i % 2 === 0 ? "TOKYO" : "SEOUL"],
        );
        made++;
      }
    });
  }
  return { players: m.playerCount, items: made };
}

async function main() {
  const pool = getPool("primary");

  // 1. Idempotent reset — batch-clear all demo tables so re-seeding is deterministic.
  let cleared = 0;
  for (const [table, pk] of TABLES) cleared += await clearTable(pool, table, pk);
  console.log(`Reset: cleared ${cleared} rows across ${TABLES.length} tables.`);

  // 2. Lay down the world: the legendary + whale, then the marketplace.
  await seedTxn(pool);
  const market = await seedMarket(pool);

  // 3. Verify the invariants the demo depends on, straight from DSQL.
  const legendary = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM item_instances WHERE template_id = $1`,
    [DEMO.legendaryTemplateId],
  );
  const legendaryCount = Number(legendary.rows[0]?.n);

  const whale = await pool.query<{ n: string; sum: string | null }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_minor),0)::text AS sum
       FROM currency_shards WHERE player_id = $1 AND currency = $2`,
    [DEMO.whalePlayerId, DEMO.currency],
  );
  const whaleShards = Number(whale.rows[0]?.n);
  const whaleGold = Number(whale.rows[0]?.sum);

  const treasury = await pool.query<{ n: string; sum: string | null }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(balance_minor),0)::text AS sum
       FROM currency_shards WHERE player_id = $1 AND currency = $2`,
    [DEMO.treasuryPlayerId, DEMO.currency],
  );
  const treasuryShards = Number(treasury.rows[0]?.n);

  const supply = await pool.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(balance_minor),0)::text AS sum
       FROM currency_shards WHERE realm_id = $1 AND currency = $2`,
    [DEMO.realmId, DEMO.currency],
  );
  const goldSupply = Number(supply.rows[0]?.sum);

  const potions = await pool.query<{ n: string; sum: string | null }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(quantity),0)::text AS sum
       FROM stack_holdings WHERE player_id = $1 AND template_id = $2`,
    [DEMO.founderPlayerId, DEMO.potionTemplateId],
  );

  const line = "─".repeat(78);
  console.log(`\n${line}`);
  console.log(`Duped seed — realm "${DEMO.realmName}" (${DEMO.realmId})`);
  console.log(line);
  console.log(
    `  Legendary    : ${DEMO.legendaryName}\n` +
      `                 instance ${DEMO.legendaryInstanceId}\n` +
      `                 owner=${DEMO.founderPlayerId} region=${DEMO.startRegion} version=0 (count=${legendaryCount})`,
  );
  console.log(
    `  Whale hoard  : ${whaleShards} GOLD shards, SUM = ${whaleGold} minor ` +
      `(= ${whaleGold / DEMO.goldMinorPerUnit} gold)`,
  );
  console.log(`  Treasury     : ${treasuryShards} GOLD shards, SUM = 0 (the double-spend sink)`);
  console.log(`  Gold supply  : ${goldSupply} minor (minted ${MINTED_GOLD_MINOR})`);
  console.log(
    `  Potions      : ${Number(potions.rows[0]?.n)} stack shards for ${DEMO.founderPlayerId}, ` +
      `SUM = ${Number(potions.rows[0]?.sum)}`,
  );
  console.log(`  Players      : 3 named + ${DEMO.rivals.length} rivals (${DEMO.rivals.join(", ")})`);
  console.log(
    `  Marketplace  : ${market.items} ordinary unique items across ${market.players} traders ` +
      `(independent rows → scales out)`,
  );
  console.log(line);

  const ok =
    legendaryCount === 1 &&
    whaleGold === DEMO.whaleStartGoldMinor &&
    goldSupply === MINTED_GOLD_MINOR;
  if (!ok) {
    console.error(
      `SEED INVARIANT FAILED: legendaryCount=${legendaryCount} (expect 1), ` +
        `whaleGold=${whaleGold} (expect ${DEMO.whaleStartGoldMinor}), ` +
        `goldSupply=${goldSupply} (expect ${MINTED_GOLD_MINOR}).`,
    );
    await pool.end();
    process.exit(1);
  }

  console.log("Seed complete — invariants OK (ONE legendary; gold sharded for DSQL OCC).");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
