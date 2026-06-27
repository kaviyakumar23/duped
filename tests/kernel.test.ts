import { describe, expect, it } from "vitest";
import { buildGoldLedgerEntries, totalGoldMinor } from "../lib/kernel/ledger";
import { computeRequestHash } from "../lib/kernel/hash";
import { jitteredBackoffMs, shuffle } from "../lib/kernel/retry";
import {
  DEMO,
  MINTED_GOLD_MINOR,
  evenSplit,
  goldShardBalances,
  regionToPoolKey,
} from "../lib/demo/config";
import { KernelError, isSerializationFailure, type TradeRequest } from "../lib/types";

/**
 * Pure-logic proofs of Duped's core guarantees — no database, so CI runs them green. The DB-backed
 * adversarial proofs (dupe race stays at 1, atomic rollback, exactly-once) live in the storm/reconcile
 * tooling and are exercised against the real Aurora DSQL cluster.
 */

describe("gold ledger — conservation (no inflation)", () => {
  it("every transfer nets to zero", () => {
    const entries = buildGoldLedgerEntries(
      [{ fromPlayerId: "a", toPlayerId: "b", amountMinor: 100 }],
      "GOLD",
    );
    expect(entries).toHaveLength(2);
    expect(entries.reduce((s, e) => s + e.signedAmountMinor, 0)).toBe(0);
    expect(entries.map((e) => e.signedAmountMinor).sort((x, y) => x - y)).toEqual([-100, 100]);
  });

  it("a whole transaction of many legs still sums to zero, with sequential line numbers", () => {
    const legs = [
      { fromPlayerId: "a", toPlayerId: "b", amountMinor: 100 },
      { fromPlayerId: "c", toPlayerId: "d", amountMinor: 250 },
      { fromPlayerId: "b", toPlayerId: "e", amountMinor: 70 },
    ];
    const entries = buildGoldLedgerEntries(legs, "GOLD");
    expect(entries).toHaveLength(6);
    expect(entries.reduce((s, e) => s + e.signedAmountMinor, 0)).toBe(0);
    expect(entries.map((e) => e.lineNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(totalGoldMinor(legs)).toBe(420);
  });

  it("rejects a non-positive leg (would break the balance/CHECK)", () => {
    expect(() =>
      buildGoldLedgerEntries([{ fromPlayerId: "a", toPlayerId: "b", amountMinor: 0 }], "GOLD"),
    ).toThrow();
    expect(() =>
      buildGoldLedgerEntries([{ fromPlayerId: "a", toPlayerId: "b", amountMinor: -5 }], "GOLD"),
    ).toThrow();
  });
});

describe("request hash — exactly-once identity", () => {
  const base: TradeRequest = {
    realmId: "r1",
    idempotencyKey: "k1",
    kind: "TRADE",
    playerA: "a",
    playerB: "b",
    itemLegs: [
      { instanceId: "i1", expectedVersion: 3, fromOwnerType: "PLAYER", fromOwnerId: "a", toOwnerType: "PLAYER", toOwnerId: "b" },
      { instanceId: "i2", expectedVersion: 0, fromOwnerType: "PLAYER", fromOwnerId: "a", toOwnerType: "PLAYER", toOwnerId: "b" },
    ],
    goldLegs: [{ fromPlayerId: "b", toPlayerId: "a", amountMinor: 500 }],
    currency: "GOLD",
    region: "TOKYO",
  };

  it("is deterministic for the same payload", () => {
    expect(computeRequestHash(base)).toBe(computeRequestHash({ ...base }));
  });

  it("is independent of leg ordering (a replay is the same request)", () => {
    const reordered: TradeRequest = { ...base, itemLegs: [base.itemLegs[1], base.itemLegs[0]] };
    expect(computeRequestHash(reordered)).toBe(computeRequestHash(base));
  });

  it("changes when the money-affecting payload changes (key reuse w/ different payload ⇒ 409)", () => {
    const diffAmount: TradeRequest = {
      ...base,
      goldLegs: [{ fromPlayerId: "b", toPlayerId: "a", amountMinor: 501 }],
    };
    const diffRegion: TradeRequest = { ...base, region: "SEOUL" };
    expect(computeRequestHash(diffAmount)).not.toBe(computeRequestHash(base));
    expect(computeRequestHash(diffRegion)).not.toBe(computeRequestHash(base));
  });
});

describe("gold supply — sharding conserves the minted total", () => {
  it("evenSplit always sums to the total", () => {
    for (const [total, count] of [[100, 7], [600000, 64], [1, 5], [999, 1]] as const) {
      const parts = evenSplit(total, count);
      expect(parts).toHaveLength(count);
      expect(parts.reduce((s, n) => s + n, 0)).toBe(total);
    }
  });

  it("the whale's sharded hoard sums to exactly the minted supply", () => {
    expect(goldShardBalances().reduce((s, n) => s + n, 0)).toBe(DEMO.whaleStartGoldMinor);
    expect(MINTED_GOLD_MINOR).toBe(DEMO.whaleStartGoldMinor + DEMO.treasuryStartGoldMinor);
  });
});

describe("region routing + OCC + error mapping", () => {
  it("maps regions to the right DSQL endpoint", () => {
    expect(regionToPoolKey("TOKYO")).toBe("primary");
    expect(regionToPoolKey("SEOUL")).toBe("secondary");
  });

  it("backoff stays within the jittered exponential bound", () => {
    for (let attempt = 1; attempt <= 15; attempt++) {
      const ceil = Math.min(120, 3 * 2 ** (attempt - 1));
      for (let i = 0; i < 50; i++) {
        const ms = jitteredBackoffMs(attempt);
        expect(ms).toBeGreaterThanOrEqual(0);
        expect(ms).toBeLessThanOrEqual(ceil);
      }
    }
  });

  it("shuffle preserves the multiset of elements", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(input).sort((a, b) => a - b)).toEqual(input);
  });

  it("detects DSQL serialization failures (40001) and maps kernel errors to HTTP", () => {
    expect(isSerializationFailure({ code: "40001" })).toBe(true);
    expect(isSerializationFailure({ code: "23505" })).toBe(false);
    expect(isSerializationFailure(new Error("x"))).toBe(false);
    expect(new KernelError("VALIDATION_ERROR", "x").httpStatus).toBe(400);
    expect(new KernelError("RETRY_EXHAUSTED", "x").httpStatus).toBe(503);
    expect(new KernelError("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", "x").httpStatus).toBe(409);
  });
});
