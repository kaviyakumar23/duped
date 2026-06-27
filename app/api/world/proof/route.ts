import { NextResponse } from "next/server";
import { getProof } from "@/lib/world/read-model";

/**
 * GET /api/world/proof — run every economy invariant query live against the Aurora DSQL truth core
 * and return the rows + PASS/FAIL ("run the SQL on camera"). Same queries the CLI reconcile uses.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return NextResponse.json(await getProof());
}
