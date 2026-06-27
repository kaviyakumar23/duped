import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo/config";
import { runGoldStorm, type GoldStormOptions } from "@/lib/swarm/runner";

/**
 * POST /api/world/gold-storm — fire the concurrent double-spend swarm at the whale's gold hoard.
 * Proves gold is conserved to the minor unit (supply after === supply before) under real OCC
 * contention. Attempts/concurrency are CLAMPED for serverless safety.
 */
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

  const opts: Partial<GoldStormOptions> = {
    attempts: Math.min(num(body.attempts) ?? 600, 1500),
    concurrency: Math.min(num(body.concurrency) ?? 60, 80),
    unitMinor: DEMO.goldUnitMinor,
    failoverAfterMs: num(body.failoverAfterMs),
  };

  try {
    const report = await runGoldStorm(opts);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: "gold_storm_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
