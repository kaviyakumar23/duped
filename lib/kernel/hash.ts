import { createHash } from "node:crypto";
import type { TradeRequest } from "../types";

/**
 * Canonical request hash. Two requests sharing an idempotency key are "the same request" iff their
 * economic payload matches. We hash the legs (what moves, between whom, at which expected version),
 * the kind, the settling region, and the currency — NOT transport details. Same key + different
 * hash ⇒ 409. This is what makes a replay provably identical, and a key-reuse-with-different-payload
 * impossible to silently accept.
 */
export function computeRequestHash(req: TradeRequest): string {
  const canonical = JSON.stringify({
    realmId: req.realmId,
    kind: req.kind,
    region: req.region,
    currency: req.currency,
    // Sort legs so ordering doesn't change identity. Item legs by instanceId, gold legs by tuple.
    itemLegs: [...req.itemLegs]
      .sort((a, b) => a.instanceId.localeCompare(b.instanceId))
      .map((l) => ({
        instanceId: l.instanceId,
        expectedVersion: l.expectedVersion,
        fromOwnerType: l.fromOwnerType,
        fromOwnerId: l.fromOwnerId,
        toOwnerType: l.toOwnerType,
        toOwnerId: l.toOwnerId,
      })),
    goldLegs: [...req.goldLegs]
      .sort(
        (a, b) =>
          a.fromPlayerId.localeCompare(b.fromPlayerId) ||
          a.toPlayerId.localeCompare(b.toPlayerId) ||
          a.amountMinor - b.amountMinor,
      )
      .map((l) => ({ from: l.fromPlayerId, to: l.toPlayerId, amount: l.amountMinor })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
