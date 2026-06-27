# Duped — Demo Runbook (< 3:00)

Goal: show the **live world**, attack one legendary 10,000 ways, and prove on camera that the count never leaves **1**. Show the WORLD, not a benchmark.

## Pre-flight (before recording)
```bash
pnpm install
pnpm db:migrate && pnpm db:index-status   # wait until 15/15 ACTIVE
pnpm db:setup-ddb
pnpm demo:reset                            # fresh: founder owns the legendary, v0, count 1
pnpm projector &                           # drain world_outbox -> DynamoDB (leave running)
PORT=3210 pnpm dev                         # open http://localhost:3210
```
For the REAL Tokyo⇄Seoul cross-region beat, repeat migrate/seed with `--env-file=.env.mr` and point the app's env at the peered cluster.

Have a terminal ready for `pnpm reconcile` (the live SQL proof) and the in-app **Run SQL proof** modal.

## The beats

| Time | Beat | Do / say |
|---|---|---|
| 0:00–0:20 | **The problem** | "Dupe bugs have wrecked game economies for 25 years — New World froze trading; Diablo II, RuneScape ran on dupes. It's a distributed-systems consistency bug, not bad luck." |
| 0:20–0:35 | **The world** | Pan the live arena: ONE glowing legendary with its owner, Tokyo + Seoul nodes, the whale. Point at the calm **× 1 / ONE LEGENDARY**. |
| 0:35–1:25 | **Dupe storm** | Click **Unleash dupe storm**. Bots swarm the legendary and deflect off the shield (blocked). Watch the toast: settled = a few, **DUPE ATTEMPTS BLOCKED = thousands**, OCC retries non-zero. The count holds at **1**; owners/item **1**. (CLI for the full 10k: `pnpm storm --attempts 10000 --concurrency 200 --pool 50`.) |
| 1:25–1:45 | **Gold double-spend** | Click **Gold double-spend**. Gold particles flow whale→treasury. Toast: supply **before == after (conserved)**, ledger balanced. (CLI: `pnpm storm --gold --attempts 10000`.) |
| 1:45–2:05 | **Scale (Track 3)** | Click **Market storm**. The marketplace lights up; the scale panel shows throughput **climbing with concurrency (42→103→204→383 trades/sec, 0 contention)**. Say: "one contested item is serial *by design* — that's why it can't dupe — but the economy as a whole is millions of independent rows, so it scales out." (CLI: `pnpm storm --market --sweep`.) |
| 2:05–2:25 | **Region toggle** | Click **Failover region** mid-storm. The active node flips Tokyo↔Seoul; trades keep settling; still zero dupes. (Real cross-region proof: the `.env.mr` storm blocked 482/482 cross-region grabs.) *(Trim this beat first if you run long.)* |
| 2:25–2:45 | **Live SQL proof** | Click **Run SQL proof** (or `pnpm reconcile`). Show the literal queries: legendary `count = 1`, gold supply = minted, ledger drift `= 0`, every txn balanced. |
| 2:45–3:00 | **Punch** | "Duplication isn't patched here — the authoritative state has no way to represent it. Exclusive ownership rows with version-guarded transfers for items; conserved balances and a balanced ledger for gold; atomic and strongly consistent across regions on Aurora DSQL." |

## Proven numbers (already run against the real clusters)
- Single-region storm: 398/400 attempts blocked, **legendary count = 1**, 39 OCC retries, 0 errors.
- **Cross-region (real Tokyo⇄Seoul):** 998/1000 blocked, **482/482 cross-region grabs blocked**, count = 1, 0 errors.
- Gold storm: 1000 transfers, supply **600000 → 600000 (conserved)**, 598 OCC retries.
- **Scale sweep (independent trades):** 42 → 103 → 204 → **383 trades/sec** at concurrency 10/25/50/100, **0 retries, 0 errors** — ~linear. (1500 distinct items × 4 levels, invariants still hold.)
- `pnpm reconcile`: **ALL CRITICAL INVARIANTS HOLD** on both clusters.

## Safety nets
- If the cloud is flaky live, play the pre-recorded backup. Keep `pnpm reconcile` output on a second screen.
- The world degrades gracefully (keeps last snapshot; never blanks). `pnpm demo:reset` returns to a pristine start.
