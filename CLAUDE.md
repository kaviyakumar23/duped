# Duped — a globally consistent economy kernel for online games

> **Positioning (use this line):** *Duped is a globally consistent economy kernel for online games. It prevents legendary-item dupes, gold double-spends, and cross-region trade exploits by making every economic action an atomic, idempotent transaction on Aurora DSQL, with DynamoDB powering the live world read model.*
>
> **The careful thesis:** Duped makes item and gold duplication **unrepresentable in the authoritative economy state — as long as every economic action goes through the kernel.** Uniqueness isn't a check you run; it's a property the data model can't violate.
>
> **Hackathon:** H0 — Hack the Zero Stack (AWS Databases + Vercel/v0). **Track 3:** Million-Scale Global App (gaming). **Databases:** Aurora DSQL (truth core) + DynamoDB (live world read model). **Deploy:** Vercel.

This file is the operating doc. Read it before changing anything. It is the source of truth for *why* the code is shaped the way it is.

---

## 1. The insight: a dupe bug *is* the double-commit problem

A dupe bug lets a player end up with two of something that should exist once. Every classic dupe vector is a concurrency/consistency failure:

| Classic exploit | What goes wrong | Correctness property |
|---|---|---|
| Trade-window race | two trades move one item at once | exactly-once, version-guarded transfer |
| Drop-and-relog | item in world *and* inventory | atomicity (all-or-nothing) |
| Disconnect mid-trade | one side credited, other not | atomic rollback |
| Cross-region dupe | item "exists" in two regions | active-active strong consistency |
| Gold double-spend | same coins spent twice | conditional atomic debit |

**item duplication = double ownership; gold duplication = double spend; trade exploit = non-atomic transfer; disconnect exploit = partial commit; cross-region dupe = split-brain.** New World, Diablo II, RuneScape, EVE, WoW have all shipped dupe bugs — because the root cause is distributed-systems correctness, not bad luck. Duped removes the root cause from the authoritative state.

---

## 2. Architecture

```
 dupe-attack bots / game clients
            │  (TradeRequest)
            ▼
   ┌──────────────────────┐     executeTrade()  — one idempotent, atomic, OCC-retrying txn
   │   THE TRADE KERNEL    │     lib/kernel/trade.ts
   └──────────┬───────────┘
              │ writes (same txn): item_instances · currency_shards · trades ·
              │ item_moves · economy_ledger_* · idempotency_registry · event_outbox
              ▼
   ╔══════════════════════╗            ╔═══════════════════════════╗
   ║  AURORA DSQL          ║  outbox    ║  DynamoDB                 ║
   ║  truth core           ║──projector→║  live world read model    ║
   ║  (Tokyo ⇄ Seoul,      ║  (async)   ║  (feed + projections)     ║
   ║   active-active)      ║            ╚═══════════════════════════╝
   ╚══════════════════════╝                        │
              ▲                                     ▼
   invariant board (live SQL)            world arena + console (Vercel / Next.js)
```

- **Aurora DSQL** is the single source of truth. IAM-token auth (no passwords): Vercel OIDC at runtime, AWS credential chain locally. Multi-region peered cluster = two strongly-consistent regional endpoints over **one logical database** (Tokyo primary `ap-northeast-1`, Seoul secondary `ap-northeast-2`).
- **DynamoDB** is the read plane only — written ONLY by the outbox projector (idempotent PutItem), never inside the trade txn.
- **No foreign keys** in DSQL (unsupported); integrity is the service layer + audit queries. **Indexes are `CREATE INDEX ASYNC`.** Money/gold is always **BIGINT minor units** (1 gold = 100 minor). UUID PKs are app-supplied.

---

## 3. The economic-object model — two kinds, protected two ways

**Do not force everything into a ledger. A sword is not money.**

### Unique items → exclusive ownership row + version-guarded transfer  *(the heart)*
`item_instances`: exactly ONE row per unique item, with ONE `owner_id` and a `version`. Every transfer (trade, drop, pickup, mail) is the same conditional UPDATE:

```sql
UPDATE item_instances
   SET owner_type=:to_type, owner_id=:to_id, region=:region, version=version+1, updated_at=now()
 WHERE instance_id=:id AND owner_type=:from_type AND owner_id=:from_id AND version=:expected;
-- rowCount MUST be 1. If 0 → someone already moved it → abort → "ITEM_MOVED".
```

Two concurrent transfers can't both match `owner_id=:from AND version=:expected`. The first to commit bumps the version; the other matches 0 rows (or conflicts at COMMIT → 40001 → retries → re-reads → still 0 rows). **Exactly one wins. "Owned twice" has no representation in the authoritative row.**

### Fungible gold → conserved balances + balanced double-entry
`currency_shards`: per-player gold balance, **sharded** so a whale / treasury is never a hot row (`CHECK balance_minor >= 0` makes overspend structurally impossible). `economy_ledger_*`: a balanced double-entry over gold — every move writes legs that net to zero, so `SUM(signed_amount_minor)=0` is the provable "no inflation" invariant. The shards (live balance) and the ledger (audit) are written in the **same transaction**, so they can never disagree.

> One sentence: *Unique items are protected by exclusive ownership rows with version-guarded transfers; fungible gold by conserved balances and a balanced ledger.*

`item_moves` is an append-only **provenance log** — audit only, NOT the thing that enforces uniqueness.

---

## 4. The tables (`drizzle/0000_init.sql`, mirrored in `lib/db/schema.ts`)

- `realms`, `players` — world + identities (home region TOKYO/SEOUL)
- `item_templates` — `fungible BOOL`, `max_stack`, rarity
- **`item_instances`** — unique items: one row, one owner, `version` guard, `region` *(the heart)*
- `currency_shards` — sharded gold balances (`CHECK >= 0`)
- `stack_holdings` — sharded fungible stacks (model completeness)
- `trades` — two-sided atomic exchange header (kind TRADE/DROP/PICKUP/MAIL)
- `item_moves` — append-only provenance (audit only)
- `economy_ledger_transactions` / `economy_ledger_entries` — balanced double-entry over **gold**
- `idempotency_registry` — exactly-once guard, keyed `(realm_id, idempotency_key)`
- `event_outbox` → DynamoDB world read model

---

## 5. The trade kernel — `lib/kernel/`

`executeTrade(req: TradeRequest): Promise<TradeSnapshot>` is the **only** way the authoritative economy changes. One attempt = one DSQL transaction:

1. **Idempotency check** (pre-txn). Registry hit + matching `request_hash` → replay the stored snapshot. Same key, different payload → 409.
2. **Item legs** — for each, `transferInstance` (the version-guarded conditional UPDATE). Any miss → ROLLBACK → DECLINED `ITEM_MOVED`/`ITEM_NOT_FOUND`. **All-or-nothing**, so a half-finished trade can't dupe.
3. **Gold legs** — `moveGold`: sharded conditional debit of the payer (random shard that covers it) + credit the payee. No shard covers it → ROLLBACK → DECLINED `INSUFFICIENT_FUNDS`.
4. **Record** trade + provenance (`item_moves`) + balanced ledger (only if gold moved) + idempotency registry + `event_outbox` — all one txn.
5. **COMMIT.** On `SQLSTATE 40001` (DSQL OCC conflict): rollback, jittered backoff, **retry with the SAME key** (idempotent), up to `MAX_TRADE_ATTEMPTS` → else 503 `RETRY_EXHAUSTED`. Retries are **surfaced, never hidden** (`snapshot.attempts`).

Files: `trade.ts` (orchestrator), `transfer.ts` (`transferInstance` + `moveGold` + `recordMove`), `ledger.ts` (gold double-entry), `hash.ts` (request hash over the legs), `retry.ts` (backoff). The request's `region` picks the DSQL endpoint via `getPool(regionToPoolKey(req.region))`.

---

## 6. Dupe attack vectors → why the state can't dupe

| Attack | Mechanism | Why it can't dupe |
|---|---|---|
| Concurrent trade race | version guard on `item_instances` | one transfer matches `version=:expected`; rest get rowCount 0 → ITEM_MOVED |
| Drop-and-relog | atomic PLAYER→WORLD transfer | exactly one location row; commit is all-or-nothing |
| Disconnect mid-trade | both legs in one txn | partial trade rolls back fully |
| Cross-region simultaneous trade | active-active strong consistency | both endpoints serialize on one logical DB; one wins globally |
| Gold double-spend | sharded atomic conditional debit | supply conserved; no negative balance |

The swarm (`lib/swarm/runner.ts`, `runDupeStorm`/`runGoldStorm`) fires these for real against `executeTrade` — no mocking.

---

## 7. The proof — `lib/world/invariants.ts` (one query each)

All critical invariants live in `runInvariants(pool)` and are shown live via `/api/world/proof` and `pnpm reconcile`:

- **Legendary exists exactly once** — `count(*) WHERE template_id=:legendary` = **1**
- **No instance owned twice** = 0 · **Every item has one owner** = 0 ownerless
- **Gold supply conserved** — `SUM(balance_minor)` for GOLD = **minted** (`MINTED_GOLD_MINOR`)
- **Ledger drift = 0** — `SUM(signed_amount_minor)` = 0 · **every txn balanced** = 0 unbalanced
- **No negative balance** = 0
- (info) valid trades settled · dupe/overspend attempts blocked

Headline targets: legendary = **1**, owners/item = **1**, gold drift = **0**, ledger drift = **0**, dupe attempts blocked = large, OCC retries = non-zero (visible), trades settled = some.

---

## 8. Project layout

```
lib/
  types.ts            TradeRequest/TradeSnapshot/ItemLeg/GoldLeg/Region/KernelError
  demo/config.ts      DEMO single-source-of-truth (Aetheria, ONE legendary, whale, gold) + MINTED_GOLD_MINOR
  db/                 dsql.ts (pool, IAM) · ddb.ts · region-router.ts (Tokyo/Seoul) · schema.ts
  kernel/             trade.ts · transfer.ts · ledger.ts · hash.ts · retry.ts
  outbox/projector.ts event_outbox → DynamoDB world read model
  swarm/runner.ts     runDupeStorm / runGoldStorm
  world/              invariants.ts (the proof) · keys.ts (DDB layout) · read-model.ts (getWorldSnapshot/getProof)
app/
  page.tsx            THE LIVE WORLD (arena + economy console) — the Track-3 face
  api/world/*         snapshot · stream (SSE) · proof · storm · gold-storm · region
  api/v1/trades       the public kernel endpoint
scripts/              migrate · seed · reconcile · prove · projector · swarm · setup-ddb · …
drizzle/0000_init.sql authoritative DDL (one statement per txn)
```

---

## 9. Run commands

```bash
pnpm install
pnpm db:check                 # SELECT NOW() — confirm DSQL creds/connection
pnpm db:migrate               # apply drizzle/0000_init.sql (one DDL per txn; indexes ASYNC)
pnpm db:index-status          # wait for UNIQUE indexes ACTIVE before traffic
pnpm db:setup-ddb             # create the DynamoDB world read-model table
pnpm db:seed                  # Aetheria: ONE legendary, whale gold, players
pnpm storm                    # run the dupe storm (CLI); pnpm reconcile to prove
pnpm reconcile                # the SQL proof: legendary=1, gold conserved, drift=0
pnpm projector                # drain outbox → DynamoDB (run during/after a storm)
pnpm dev                      # the live world at /
```

Local tooling uses `.env.local` (single-region `ap-south-1` cluster, fast dev). For the **real Tokyo⇄Seoul cross-region demo**, use `.env.mr` (peered cluster; `PGHOST_SECONDARY` set so SEOUL trades route to the Seoul endpoint for real). Deployed app uses Vercel OIDC (no creds in code).

---

## 10. Scope discipline (do NOT build)

- ❌ A real game engine, combat, movement, accounts, art.
- ❌ A full auction-house UI — one contested item is sharper than a marketplace.
- ❌ Double-entry for unique items — uniqueness is an ownership-row property, not a ledger balance.
- ✅ The kernel, the single-item dupe storm, the SQL proof, the region toggle, one striking visual.

If you must cut: legacy-contrast mode first, then world polish, then the gold scene. **Never cut the single-item dupe storm + the SQL proof — that's the project.**

---

## 11. Integrity note

Duped shares infrastructure patterns (DSQL pool, OIDC auth, OCC-retry, idempotency, outbox, multi-region) with a sibling commerce project. That's how a real team ships two products on shared internals. **The domain model and the demo are genuinely distinct** (unique-item ownership + two-sided trades + cross-region dupe defense vs. commerce inventory/budgets). Present Duped on its own terms; never frame it as a rename. If asked whether code is shared: yes — two products, one engine. That's fine and common.

### The line to repeat
**Duped makes item and gold duplication unrepresentable in a game's authoritative economy state — exclusive ownership rows with version-guarded transfers for unique items, conserved balances and a balanced ledger for gold — atomic and strongly consistent across regions on Aurora DSQL.**
