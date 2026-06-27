import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo/config";
import { runMarketStorm, type MarketStormOptions } from "@/lib/swarm/runner";

/**
 * POST /api/world/market-storm — the MILLION-SCALE beat. Fires thousands of INDEPENDENT item trades
 * (each moves a distinct row, so no hot row, no contention) and reports throughput. This is the
 * linear-scale half of the story; the dupe storm is the correctness-under-contention half.
 *
 * Serverless-safe: attempts/concurrency are clamped. The big sweep is the CLI (`pnpm storm --market --sweep`).
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

  const opts: Partial<MarketStormOptions> = {
    attempts: Math.min(num(body.attempts) ?? DEMO.market.storm.attempts, 1500),
    concurrency: Math.min(num(body.concurrency) ?? 80, 100),
  };

  try {
    const report = await runMarketStorm(opts);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: "market_storm_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
