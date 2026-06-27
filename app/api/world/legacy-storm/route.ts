import { NextResponse } from "next/server";
import { runLegacyStorm } from "@/lib/swarm/legacy";

/** POST /api/world/legacy-storm — fire the SAME race at the BROKEN (no-version-guard) model. The one
 *  legendary multiplies: copiesAfter > 1. The contrast with Duped (which stays 1) is the whole point. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const report = await runLegacyStorm({
      attempts: Math.min(num(body.attempts) ?? 20, 80),
      concurrency: Math.min(num(body.concurrency) ?? 20, 40),
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: "legacy_storm_failed", message: (err as Error).message }, { status: 500 });
  }
}
