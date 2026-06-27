import { NextResponse } from "next/server";
import { legacyState } from "@/lib/swarm/legacy";

/** GET /api/world/legacy — live state of the BROKEN economy: how many copies of the one legendary
 *  currently exist (1 = correct; >1 = duped). The contrast panel polls this. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await legacyState());
  } catch (err) {
    return NextResponse.json({ error: "legacy_state_failed", message: (err as Error).message }, { status: 500 });
  }
}
