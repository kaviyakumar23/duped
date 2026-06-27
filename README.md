# Duped — a globally consistent economy kernel for online games

> **Duped makes item & gold duplication unrepresentable in a game's authoritative economy state** — exclusive ownership rows with version-guarded transfers for unique items, conserved balances and a balanced ledger for gold — **atomic and strongly consistent across regions on Aurora DSQL**, with **DynamoDB** powering the live world read model. Deployed on **Vercel**.

Built for **H0 — Hack the Zero Stack** · Track 3 (Million-Scale Global App, gaming).

A dupe bug lets a player end up with two of something that should exist once — a legendary item, a stack of gold. It has wrecked game economies for 25 years (New World, Diablo II, RuneScape, EVE, WoW) because the root cause is **distributed-systems correctness**, not bad luck. Duped removes the root cause: every economic action is one atomic, idempotent transaction through a kernel, and uniqueness is a property the data model can't violate.

## How it works

Two kinds of object, protected two different ways (a sword is not money):

- **Unique items** → `item_instances`: exactly ONE row per item, moved only by a version-guarded conditional `UPDATE ... WHERE owner_id=:from AND version=:expected`. Two concurrent transfers can't both match → "owned twice" is unrepresentable.
- **Gold** → `currency_shards` (sharded balance, `CHECK >= 0`) + a balanced double-entry ledger. Live balance and audit ledger are written in the same transaction; `SUM = 0` proves no inflation.

The **cross-region** dupe — the hardest one — collapses on Aurora DSQL's active-active strong consistency: a trade in Tokyo and a trade in Seoul on the same item serialize against one logical database; exactly one wins globally.

**Scale (Track 3 — million-scale by design).** Correctness and scale fall out of the *same* design. One *contested* item is a single hot row — deliberately serial, which is exactly why duplication is impossible. But a real economy is millions of *independent* rows: every player trading their own items contends with no one, so throughput scales horizontally. DSQL sharding + active-active multi-region + a DynamoDB read plane (CQRS) is a scale-to-millions architecture, not an afterthought.

```
bots / clients → executeTrade()  →  Aurora DSQL (truth core, Tokyo⇄Seoul)
                 (one atomic txn)         │ world_outbox → projector → DynamoDB (live world read model)
                                          ▼                                     │
                              invariant board (live SQL)        world arena + console (Vercel)  /
```

See `CLAUDE.md` for the full architecture and `design/architecture.md` for the submission diagram.

## Proven (against the real clusters)

- Dupe storm: thousands of bots vs. ONE legendary → **count stays 1**, dupe attempts blocked, OCC retries surfaced, 0 errors.
- **Cross-region (real Tokyo⇄Seoul cluster):** 482/482 simultaneous cross-region grabs blocked, count = 1.
- Gold double-spend: supply **in = out (conserved)**, ledger balanced.
- **Scale (independent trades):** throughput scales ~linearly with concurrency — **42 → 103 → 204 → 383 trades/sec** at concurrency 10/25/50/100, **0 contention, 0 errors** (`pnpm storm --market --sweep`). One hot row is serial *by nature*; the economy as a whole scales out.
- `pnpm reconcile`: **ALL CRITICAL INVARIANTS HOLD** — 0 dupes, gold conserved, $0 ledger drift.

## Quickstart

```bash
pnpm install
pnpm db:check                 # confirm Aurora DSQL connectivity
pnpm db:migrate               # apply schema (one DDL per txn; indexes ASYNC)
pnpm db:index-status          # wait for 15/15 indexes ACTIVE
pnpm db:setup-ddb             # create the DynamoDB world read-model table
pnpm db:seed                  # Aetheria: ONE legendary, whale gold, players
pnpm storm                    # the dupe storm  (--gold for the double-spend; --help via flags)
pnpm reconcile                # the SQL proof
pnpm projector                # drain outbox → DynamoDB (run during/after a storm)
pnpm dev                      # the live world at http://localhost:3000
```

Local dev uses `.env.local` (single-region cluster). For the real Tokyo⇄Seoul cross-region demo, use `.env.mr` (`pnpm exec tsx --env-file=.env.mr scripts/<script>.ts`).

## Stack
Next.js 15 (App Router, React 19, TS) · Aurora DSQL (`@aws/aurora-dsql-node-postgres-connector`, IAM/OIDC auth) · DynamoDB · Vercel. No foreign keys, async indexes, BIGINT minor units, app-supplied UUIDs.

### The line
**Duplication isn't patched here — the authoritative state has no way to represent it.**
