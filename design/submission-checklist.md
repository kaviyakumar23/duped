# Duped — Devpost Submission Checklist (H0)

## Build status (done ✓)
- [x] Trade kernel (version-guarded transfer + two-sided atomic trade + OCC + idempotency) — typechecks, proven
- [x] Dupe-attack swarm + gold double-spend (real `executeTrade`, no mocking)
- [x] Economy invariants + live SQL proof (`pnpm reconcile`, `/api/world/proof`) — ALL PASS
- [x] Outbox projector → DynamoDB live world read model
- [x] World arena + economy console (root `/`) — builds, renders, API-wired
- [x] `pnpm build` clean; `pnpm typecheck` clean
- [x] Proven on real single-region (ap-south-1) AND real Tokyo⇄Seoul peered cluster (482/482 cross-region grabs blocked)
- [x] **Million-scale beat (Track 3):** independent market trades scale ~linearly — 42→103→204→**383 trades/sec** at concurrency 10/25/50/100, 0 contention (`pnpm storm --market --sweep`) + a live world scale panel

## Devpost submission
- [ ] **Text description** — name **Aurora DSQL** (truth core) + **DynamoDB** (live world read model). Tag **Track 3 — Million-Scale Global App (gaming)**.
- [ ] **Demo video < 3:00**, public on **YouTube** — dupe storm + gold double-spend + region toggle + live SQL proof. Must explain the AWS DBs used + show it working. (Script: `design/video-script.md`.)
- [ ] **Architecture diagram** — `design/architecture.md` (agents → kernel → DSQL ⇄ DynamoDB, Tokyo/Seoul). Export to an image.
- [ ] **AWS DB-usage screenshot** — Aurora DSQL console (cluster + `item_instances`/`currency_shards`/`trade_idempotency`) AND DynamoDB console (`duped` table). The cross-region peering view is a strong shot.
- [ ] **Published Vercel link** (the live world).
- [ ] **Vercel Team ID**.
- [ ] **Newness** — DB + Vercel integration used during the submission period.

## Bonus (+0.6 max)
- [ ] Publish ≥1 **#H0Hackathon** build post (`design/build-post.md`) on builder.aws.com / dev.to / Medium / YouTube. Must state it was made for this hackathon, public (not unlisted). +0.2 each, up to 3.

## Deploy notes
- Vercel via the AWS Marketplace integration (DSQL + DynamoDB) → injects OIDC env (`AWS_ROLE_ARN`, `PGHOST`, `DDB_*`). No credentials in code.
- For the **real cross-region** demo, point `PGHOST`/`PGHOST_SECONDARY` at the peered Tokyo/Seoul cluster (see `.env.mr`).
- Backup: save a local screen recording of the full demo.

## Integrity line (if asked about shared code)
Yes — Duped and its sibling commerce project share infra patterns (one engine, two products). The domain model and demo are genuinely distinct. Never frame Duped as a rename.
