# Duped — Verified Facts Sheet (source of truth for all submission copy)

> RULE: every number in any submission doc must come from this sheet (all measured this build) or be marked **[VERIFY]**. Never invent. Honest framing notes are included — follow them.

## Identity
- **Project:** Duped
- **One-liner:** A globally consistent economy kernel for online games — it makes item & gold duplication *unrepresentable* in a game's authoritative state.
- **Hackathon:** H0 — "Hack the Zero Stack" (AWS Databases + Vercel / v0). URL: https://h01.devpost.com
- **Track:** Track 3 — Million-Scale Global App (gaming).
- **Judging:** 4 equally-weighted criteria — Technical Implementation, Design, Impact & Real-World Applicability, Originality. Stage-one pass/fail on theme + required APIs. Up to **+0.6** bonus for published content (#H0Hackathon, +0.2 each, max 3). *(Technical Implementation is the de-facto tie-breaker.)*
- **Hero / required tech:** **Aurora DSQL** (the truth core). Also **DynamoDB** (live read model). Front end on **Vercel**. (Only one AWS DB is required; using DSQL + DynamoDB is a strength.)

## Links / IDs
- **Live demo:** https://duped-two.vercel.app  (public, no login wall — verified 200 on /, /try, /docs)
- **Repo:** https://github.com/kaviyakumar23/duped  — **[USER ACTION] currently PRIVATE; make public for judges + the CI badge.**
- **Vercel Team ID:** `team_jBpMjbUf4sAswZ9CSak3WGIl`  — **[USER CONFIRM]**
- **GitHub account:** kaviyakumar23

## Stack ("Built with")
Next.js 15 (App Router) · React 19 · TypeScript · **Aurora DSQL** (`@aws/aurora-dsql-node-postgres-connector`, IAM/OIDC auth, no passwords) · **Amazon DynamoDB** (single-table read model) · **Vercel** (deploy, OIDC federation to AWS) · node-postgres (pg) · pnpm · Vitest · GitHub Actions.

## The differentiator (the honest "why not the simpler tool?")
Uniqueness isn't a lock you take or a check you run — it's a **structural property of the schema**. A unique item is exactly ONE row with one `owner_id` and a `version`; every transfer is one conditional `UPDATE … WHERE owner_id=:from AND version=:expected`. Two concurrent transfers can't both match, so **"owned twice" has no representation** in the authoritative state. Gold is sharded conserved balances + a balanced double-entry ledger (supply in = out). And because Aurora DSQL is **active-active across regions over one logical database**, the *hardest* dupe — the cross-region one — collapses: a Tokyo trade and a Seoul trade on the same item serialize against one source of truth; exactly one wins globally. *Why not a single-region DB + locks?* Locks don't span regions and add a hot path; an item in two regions is the classic split-brain dupe. DSQL removes the window entirely.

## The measured "wow" (ALL real, this build)
- **Dupe storm (single contested legendary) — THE HEADLINE, real 10k run:** **10,000 concurrent attempts → 9,992 dupe attempts BLOCKED**, 8 legitimate transfers settled (one per wave), **legendary count AFTER = 1**, **632 OCC (SQLSTATE 40001) retries surfaced**, **0 errors**, 50.7s. *(Framing: "10,000 attempts, 9,992 rejected" — say "attempts," NOT "commits".) A smaller 400-attempt run gave 398 blocked / count=1 / 39 retries — same result, faster, good for a live click in the demo.*
- **Cross-region, on the REAL peered cluster** — Tokyo `ap-northeast-1` ⇄ Seoul `ap-northeast-2`, one logical DSQL DB: a 1,000-attempt run blocked 998, of which **482 / 482 simultaneous cross-region grabs were blocked**, count stayed **1**, **0 errors**. This is the strongest single result.
- **Gold double-spend:** 1,000 concurrent transfers from the whale → supply **600,000 → 600,000 minor (conserved, == minted)**, **598 OCC retries**, 0 errors. (1 gold = 100 minor; minted = 600,000 minor = 6,000 gold.)
- **Linear scale (independent trades):** throughput **42 → 103 → 204 → 383 trades/sec** at concurrency 10 / 25 / 50 / 100, **0 contention, 0 errors** — ~2× per 2× concurrency.
- **The contrast (the killer demo beat):** a deliberately-broken naive table (no version guard) **duplicates the one legendary to ~20 copies** under a trade race (real rows, `SELECT count(*) FROM legacy_inventory …`); the SAME race through the kernel leaves `item_instances` count = **1**.
- **Adversarial proofs (direct, real):** atomic rollback (mixed item+gold trade where the buyer can't pay → the item stays put), exactly-once replay (same idempotency key → one effect, `replayed:true`), payload-mismatch → **409**.
- **The SQL proof (`pnpm reconcile`, both clusters): ALL CRITICAL INVARIANTS HOLD** — legendary count = 1, no instance owned twice = 0, every item one owner, gold supply = minted, ledger drift = 0, every txn balanced, no negative balance.
- **Tests + CI:** **12 Vitest unit tests pass** (conservation, exactly-once hashing, sharding-conserves-minted, region routing, OCC backoff bounds, error mapping); **GitHub Actions CI is green**.

## Architecture (for the diagram + "How we built it")
bots / clients / `POST /api/v1/trades` → **executeTrade()** (one idempotent, atomic, OCC-retrying DSQL txn; version-guarded item transfer + sharded conserved gold + balanced ledger) → writes `item_instances`, `currency_shards`, `trades`, `item_moves`, `economy_ledger_*`, `trade_idempotency`, `world_outbox` in one transaction → **Aurora DSQL** truth core (active-active Tokyo⇄Seoul) → transactional outbox → **DynamoDB** live world read model (settlement feed + projections; written project-on-read) → Next.js world on **Vercel**. Invariant board runs live SQL against DSQL. No foreign keys (DSQL); async indexes; money in BIGINT minor units; UUID PKs app-supplied.

## The demo world (names)
Realm **Aetheria**; one legendary **"Aurora, the Last Legendary Blade"** (founder **Aurelia_Vale**); a gold whale; a marketplace of **1,500 independent unique items across 300 traders**.

## Site map (for testing instructions)
- `/` landing (problem → insight → how it works → proof → CTA)
- `/try` guided demo: the **"Same attack. Two databases."** contrast (Run the trade race → naive dupes to ~20; Run the SAME race → Duped stays ×1), a 6-step guided tour, the world arena, economy console + invariant board, the million-scale panel, **Cross-region Defense** (482/482), live settlement feed, **Reset world** button, **Trace this legendary's history** (provenance), **Run SQL proof** modal.
- `/docs` Overview · Concepts · Quickstart · API Reference (`POST /api/v1/trades`) · Architecture · Integration.

## Honest scope / caveat (say it — it reads as rigor)
Guarantees hold **"as long as every economic action goes through the kernel."** App bugs, admin minting tools, or paths that bypass the kernel are out of scope. Duped is the economy / trade **settlement layer** (trades, drops, mail, auction house, cross-region transfers, item marketplaces) — not the real-time combat loop. The live demo runs single-region (ap-south-1); the cross-region result is measured on the real peered Tokyo⇄Seoul cluster (cited as measured).

## [USER ACTION] — only you can do these (do NOT fake)
- Country of Residence; Submitter Type (personal).
- File uploads: **architecture diagram image** (a starter SVG is in design/submission/architecture.svg), **AWS console proof screenshot** (DSQL cluster + DynamoDB table), image gallery, and the **demo video** (record + upload to YouTube; then paste the link).
- Make the **GitHub repo public**.
- Confirm the **Vercel Team ID** + GitHub account.
- Provide the **Devpost draft URL** so the browser can fill it.
- Confirm the **deadline date/time/timezone** (today is 2026-06-29 — likely today; treat as URGENT).
- The final **Submit** (Devpost) and **Publish** (blog) clicks.
