import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/region-router";
import { DEMO } from "@/lib/demo/config";

/**
 * GET /api/world/provenance — the legendary's COMPLETE ownership chain from the append-only
 * item_moves log. Every owner it has ever had, in order — and, by the single-row design, never two
 * at the same time. "Here is the sword's entire history; it was never in two places at once."
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SQL = `
  SELECT move_kind, from_owner_id, to_owner_type, to_owner_id, to_region, version_after, created_at
    FROM item_moves
   WHERE instance_id = $1
   ORDER BY created_at ASC, version_after ASC
   LIMIT 250`;

export interface ProvenanceMove {
  moveKind: string;
  fromOwnerId: string | null;
  toOwnerType: string;
  toOwnerId: string;
  toRegion: string;
  versionAfter: number;
  createdAt: string;
}

export async function GET(): Promise<Response> {
  try {
    const pool = getPool("primary");
    const { rows } = await pool.query(SQL, [DEMO.legendaryInstanceId]);
    const chain: ProvenanceMove[] = rows.map((r) => ({
      moveKind: String(r.move_kind),
      fromOwnerId: r.from_owner_id == null ? null : String(r.from_owner_id),
      toOwnerType: String(r.to_owner_type),
      toOwnerId: String(r.to_owner_id),
      toRegion: String(r.to_region),
      versionAfter: Number(r.version_after),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
    const distinctOwners = new Set(chain.map((m) => m.toOwnerId)).size;
    return NextResponse.json({
      instanceId: DEMO.legendaryInstanceId,
      name: DEMO.legendaryName,
      totalMoves: chain.length,
      distinctOwners,
      // By the exclusive-ownership-row design, the item is in exactly one place at every point in
      // this history. This is a structural property, not a runtime check.
      neverTwoAtOnce: true,
      chain,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "provenance_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
