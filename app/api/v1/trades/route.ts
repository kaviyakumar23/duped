import { NextResponse } from "next/server";
import { executeTrade } from "@/lib/kernel/trade";
import { KernelError, type TradeRequest } from "@/lib/types";

/**
 * POST /api/v1/trades — the PUBLIC kernel endpoint. The only way state changes: parse a
 * TradeRequest, run the idempotent, OCC-retrying, atomic, version-guarded `executeTrade`, and
 * return the canonical snapshot.
 *
 *   - COMMITTED → 201, DECLINED (a business outcome, not an error) → 200 with the snapshot
 *   - KernelError → its mapped HTTP status (400/404/409/503) with { error, message }
 *   - anything else → 500
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let req: TradeRequest;
  try {
    req = (await request.json()) as TradeRequest;
  } catch {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const snap = await executeTrade(req);
    return NextResponse.json(snap, { status: snap.outcome === "COMMITTED" ? 201 : 200 });
  } catch (err) {
    if (err instanceof KernelError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.httpStatus },
      );
    }
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: (err as Error).message },
      { status: 500 },
    );
  }
}
