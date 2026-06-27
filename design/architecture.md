# Duped — Architecture (submission)

**Track 3 · Million-Scale Global App (gaming) · Aurora DSQL + DynamoDB · Vercel**

## One-line
Duped is a globally consistent **economy kernel for online games**. It makes legendary-item dupes, gold double-spends, and cross-region trade exploits **unrepresentable in the authoritative state** — by making every economic action an atomic, idempotent transaction on **Aurora DSQL**, with **DynamoDB** powering the live world read model.

## System diagram

```
                    dupe-attack bots  /  game clients  /  POST /api/v1/trades
                                     │  (TradeRequest: itemLegs[] + goldLegs[])
                                     ▼
                       ┌──────────────────────────────┐
                       │        THE TRADE KERNEL        │   executeTrade()
                       │  lib/kernel/trade.ts           │   one idempotent, atomic,
                       │  • version-guarded transfer    │   OCC-retrying DSQL txn
                       │  • sharded conditional gold     │
                       │  • double-entry ledger          │
                       │  • idempotency registry          │
                       └───────────────┬────────────────┘
        writes, one transaction:       │
   item_instances · currency_shards ·  │
   trades · item_moves · economy_ledger_* · trade_idempotency · world_outbox
                                        ▼
        ╔═══════════════════════════════════════╗      world_outbox      ╔═══════════════════════════╗
        ║  AURORA DSQL  —  TRUTH CORE            ║  ── outbox projector ──▶║  DynamoDB                 ║
        ║  active-active, strongly consistent    ║   (async, idempotent   ║  LIVE WORLD READ MODEL    ║
        ║  Tokyo ap-northeast-1  ⇄  Seoul        ║    PutItem)            ║  single-table:            ║
        ║  ap-northeast-2  (one logical DB)       ║                        ║   EVENT feed +            ║
        ╚════════════════════╦══════════════════╝                        ║   ITEM / REALM projections║
                 invariant board (live SQL)                              ╚═════════════╦═════════════╝
                             │                                                          │
                             ▼                                                          ▼
              GET /api/world/proof  ◀──────────  Next.js on Vercel  ──────────▶  GET /api/world/stream (SSE)
                                            THE LIVE WORLD ( / )  — arena + economy console
```

## Why two databases (the deliberate architectural choice)
- **Aurora DSQL = truth core.** Strongly-consistent, active-active across regions, optimistic concurrency. Every write goes through one kernel transaction. The structural guarantees live in the schema:
  - **Unique items** → `item_instances`: exactly ONE row per item, moved only by a version-guarded conditional `UPDATE ... WHERE owner_id=:from AND version=:expected`. Two concurrent transfers can't both match → **"owned twice" is unrepresentable**.
  - **Gold** → `currency_shards` (sharded balance, `CHECK >= 0`) + `economy_ledger_*` (balanced double-entry). Live balance and audit ledger are written in the SAME txn, so they can never disagree. `SUM=0` is the "no inflation" invariant.
  - DSQL has no foreign keys and builds indexes `ASYNC`; the two UNIQUE idempotency indexes are the structural exactly-once guard.
- **DynamoDB = read plane.** Written ONLY by the transactional-outbox projector (idempotent `PutItem`), never inside the trade txn. Holds the settlement feed + the legendary's live location/owner + realm counters. The world map visibly *is* this read model; the invariant board queries the DSQL truth core live.

## Cross-region dupe defense (the single cleanest case for active-active)
The peered DSQL cluster exposes Tokyo + Seoul endpoints over **one logical database**. A trade routed to Tokyo and a trade routed to Seoul on the same legendary, at the same instant, both serialize against the same source of truth — exactly one wins globally. No replication-lag window, no split-brain, no dupe. Failover flips the active endpoint mid-storm and trades keep settling.

## Scale — million-scale by design (Track 3)
Correctness and scale come from the same model, not a trade-off:
- **One *contested* item is a single hot row** — inherently serial. That's not a bottleneck to apologize for; it's *why* duplication is impossible. Any correct system must serialize writes to one item.
- **A real economy is millions of *independent* rows.** Every player trading their own items touches a different row, contends with no one, and parallelizes. Throughput scales horizontally.
- The scale primitives are deliberate: **sharded** balances (no hot whale/treasury row), **active-active multi-region** DSQL (global writes, one logical DB), a **DynamoDB read plane** (CQRS — reads scale independently of writes), and a **stateless idempotent kernel** (serverless horizontal compute on Vercel).

Measured on Aurora DSQL (independent market trades, `pnpm storm --market --sweep`):

| concurrency | throughput | retries | errors |
|---|---|---|---|
| 10 | 42 trades/sec | 0 | 0 |
| 25 | 103 trades/sec | 0 | 0 |
| 50 | 204 trades/sec | 0 | 0 |
| 100 | **383 trades/sec** | 0 | 0 |

~2× throughput per 2× concurrency, with zero contention — the linear-scale signature. The single-legendary storm (one hot row, ~0.4 settles/sec, many retries) is the *correctness-under-max-contention* foil; together they are the whole story.

## Proven, live (against the real cluster)
A 400-attempt storm: **2** legitimate settles, **398** dupe attempts blocked, legendary count **= 1**, 39 OCC retries surfaced, 0 errors. A 1000-transfer gold storm: gold supply **600000 → 600000 (conserved)**, 598 OCC retries, 0 errors. `pnpm reconcile`: **ALL CRITICAL INVARIANTS HOLD** — 0 dupes, gold conserved, $0 ledger drift.

## AWS-usage proof (for the submission screenshot)
- Aurora DSQL console: the cluster + the `item_instances` / `currency_shards` / `trade_idempotency` tables (and the multi-region peering for Tokyo⇄Seoul).
- DynamoDB console: the `duped` table (single-table world read model — EVENT + projection items).
