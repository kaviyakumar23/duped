import { NextResponse } from "next/server";
import { resetLegacy } from "@/lib/swarm/legacy";

/** POST /api/world/legacy-reset — collapse the broken economy back to a single correct copy so the
 *  before/after can be run again. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  try {
    return NextResponse.json(await resetLegacy());
  } catch (err) {
    return NextResponse.json({ error: "legacy_reset_failed", message: (err as Error).message }, { status: 500 });
  }
}
