import { NextResponse } from "next/server";
import { getWorldSnapshot } from "@/lib/world/read-model";

/**
 * GET /api/world/snapshot — one authoritative world snapshot (the legendary's single owner, the
 * invariant board, region health, live feed). Read from the Aurora DSQL truth core + DynamoDB feed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.json(await getWorldSnapshot());
}
