import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo/config";
import { runDupeStorm, type DupeStormOptions } from "@/lib/swarm/runner";

/**
 * POST /api/world/storm — fire the dupe-attack swarm at the ONE legendary from the world UI.
 *
 * Serverless-safe by design: attempts/concurrency are CLAMPED so a single invocation can't blow the
 * function budget. The big 10,000-bot headline run is meant for the CLI; this is the always-works
 * web trigger that still produces real OCC contention and an honest report.
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

  const opts: Partial<DupeStormOptions> = {
    attempts: Math.min(num(body.attempts) ?? 600, 1500),
    concurrency: Math.min(num(body.concurrency) ?? 60, 80),
    waves: num(body.waves) ?? 3,
    dropRate: num(body.dropRate) ?? DEMO.swarm.dropRate,
    crossRegionRate: num(body.crossRegionRate) ?? DEMO.swarm.crossRegionRate,
    failoverAfterMs: num(body.failoverAfterMs),
  };

  try {
    const report = await runDupeStorm(opts);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: "storm_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
