import { NextResponse } from "next/server";
import { resetWorld } from "@/lib/demo/reset";

/** POST /api/world/reset — restore the live demo to a pristine, invariant-holding state (legendary
 *  → founder/Tokyo, gold → minted, legacy → 1). The "Reset world" button, so judges can always
 *  return to a clean start. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(): Promise<Response> {
  try {
    return NextResponse.json(await resetWorld());
  } catch (err) {
    return NextResponse.json({ error: "reset_failed", message: (err as Error).message }, { status: 500 });
  }
}
