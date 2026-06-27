import { NextResponse } from "next/server";
import { failoverTo, getActiveRegion, toggleRegion } from "@/lib/db/region-router";
import { poolKeyToRegion, regionToPoolKey } from "@/lib/demo/config";
import type { Region } from "@/lib/types";

/**
 * Region control for the multi-region failover demo. GET returns the active write endpoint as a
 * Region; POST flips it (toggleRegion) or pins a specific region (TOKYO→primary, SEOUL→secondary)
 * and returns the new active region. State is an in-process singleton — the headline failover is
 * also driven by the swarm itself mid-run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.json({ activeRegion: poolKeyToRegion(getActiveRegion()) });
}

export async function POST(request: Request): Promise<Response> {
  let region: Region | undefined;
  try {
    const body = (await request.json()) as { region?: Region };
    region = body.region;
  } catch {
    region = undefined;
  }

  const active =
    region === "TOKYO" || region === "SEOUL"
      ? failoverTo(regionToPoolKey(region))
      : toggleRegion();

  return NextResponse.json({ activeRegion: poolKeyToRegion(active) });
}
