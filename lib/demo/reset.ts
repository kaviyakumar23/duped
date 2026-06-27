import { randomUUID } from "node:crypto";
import { getPool } from "../db/region-router";
import { resetLegacy } from "../swarm/legacy";
import { DEMO, goldShardBalances } from "./config";

/**
 * Restore the live demo to a pristine, invariant-holding state — the "Reset world" button. Judges
 * will hammer every control; this puts the legendary back with the founder in Tokyo, restores the
 * whale's hoard (gold supply == minted, so conservation still holds), and collapses the broken
 * legacy economy back to a single copy. Cumulative counters/feed are left alone (they harmlessly
 * show the system has handled traffic). Fast — no full re-seed of the marketplace.
 */
export interface ResetSummary {
  legendaryOwner: string;
  legendaryRegion: string;
  goldSupplyMinor: number;
  legacyCopies: number;
}

const OCC = "40001";

export async function resetWorld(): Promise<ResetSummary> {
  const pool = getPool("primary");
  const whale = goldShardBalances(); // 64 shards summing to whaleStartGoldMinor

  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("BEGIN");

      // 1. The legendary back to the founder, in Tokyo. version bumps (monotonic) — count stays 1.
      await pool.query(
        `UPDATE item_instances
            SET owner_type='PLAYER', owner_id=$2, region='TOKYO', version=version+1, updated_at=CURRENT_TIMESTAMP
          WHERE instance_id=$1`,
        [DEMO.legendaryInstanceId, DEMO.founderPlayerId],
      );

      // 2. Gold back to exactly minted: clear GOLD shards, re-seed whale (hoard) + treasury (0).
      await pool.query(`DELETE FROM currency_shards WHERE realm_id=$1 AND currency='GOLD'`, [
        DEMO.realmId,
      ]);
      for (let i = 0; i < whale.length; i++) {
        await pool.query(
          `INSERT INTO currency_shards (shard_id, realm_id, player_id, currency, balance_minor, shard_no)
           VALUES ($1,$2,$3,'GOLD',$4,$5)`,
          [randomUUID(), DEMO.realmId, DEMO.whalePlayerId, whale[i], i],
        );
      }
      for (let i = 0; i < DEMO.goldShardCount; i++) {
        await pool.query(
          `INSERT INTO currency_shards (shard_id, realm_id, player_id, currency, balance_minor, shard_no)
           VALUES ($1,$2,$3,'GOLD',0,$4)`,
          [randomUUID(), DEMO.realmId, DEMO.treasuryPlayerId, i],
        );
      }

      await pool.query("COMMIT");
      break;
    } catch (err) {
      await pool.query("ROLLBACK").catch(() => {});
      if ((err as { code?: string }).code === OCC && attempt < 12) {
        await new Promise((r) => setTimeout(r, 40 * attempt));
        continue;
      }
      throw err;
    }
  }

  // 3. Collapse the broken legacy economy back to one copy.
  const legacy = await resetLegacy();

  const supply = await pool.query<{ n: string }>(
    `SELECT COALESCE(sum(balance_minor),0)::text AS n FROM currency_shards WHERE realm_id=$1 AND currency='GOLD'`,
    [DEMO.realmId],
  );

  return {
    legendaryOwner: DEMO.founderHandle,
    legendaryRegion: "TOKYO",
    goldSupplyMinor: Number(supply.rows[0]?.n ?? 0),
    legacyCopies: legacy.copies,
  };
}
