# ZeroRace — multi-region failover demo (real peered Aurora DSQL)

A real **peered multi-region DSQL cluster** — one logical database exposed through two
strongly-consistent regional write endpoints — powers the failover demo. This is the capability
that answers "why not single-writer Postgres."

## The cluster (account 563999587731)

| Role | Region | Identifier | Endpoint |
|---|---|---|---|
| Primary | Tokyo `ap-northeast-1` | `jbt4bv7e4v7yykjy5fnfuejab4` | `jbt4bv7e4v7yykjy5fnfuejab4.dsql.ap-northeast-1.on.aws` |
| Secondary | Seoul `ap-northeast-2` | `75t4bwipa7ile564wr7bnwhppy` | `75t4bwipa7ile564wr7bnwhppy.dsql.ap-northeast-2.on.aws` |
| Witness | Osaka `ap-northeast-3` | — | (quorum only, no endpoint) |

Provisioned via `aws dsql create-cluster` with `multiRegionProperties` (witness + peer ARNs), then
linked with `update-cluster`. Endpoints are wired in **`.env.mr`** (gitignored): `PGHOST` = Tokyo,
`PGHOST_SECONDARY` = Seoul, **no** `AWS_REGION` (the connector auto-detects each endpoint's region),
**no** OIDC token (uses the local admin AWS credential chain).

## Run the demo

```bash
tsx --env-file=.env.mr scripts/migrate.ts        # one logical DB — migrate via either endpoint
tsx --env-file=.env.mr scripts/index-status.ts   # wait until indexes ACTIVE
tsx --env-file=.env.mr scripts/seed.ts           # 100 units / 64 inventory + 20 budget buckets
# Swarm against Tokyo, flip to Seoul mid-run:
tsx --env-file=.env.mr scripts/swarm.ts --attempts 700 --concurrency 40 --pool 40 --failover-after-ms 5000
tsx --env-file=.env.mr scripts/reconcile.ts      # prove invariants AFTER the cross-region failover
```

## Proven (live)

- **Strong consistency across regions:** a row committed via Tokyo is immediately readable via Seoul
  (not eventual).
- **Mid-swarm failover:** flipping the active write endpoint Tokyo → Seoul, settlements split
  `primary=10  secondary=90` — **total exactly 100, 0 oversold, 0 errors, 0 conflict-exhausted**.
- **Invariants hold after failover:** `reconcile` passes every check (oversell / dupe / drift /
  mandate = 0) even though writes came from both regions — because it's one logical DB.
- **Resilience:** a pg Pool with no `'error'` listener crashes the process when a region's idle
  connections drop; `lib/db/dsql.ts` attaches an idle-error handler so failover is non-fatal.

## Cleanup (stop billing when done recording)

The clusters have deletion protection **off**. Delete both:

```bash
aws dsql delete-cluster --region ap-northeast-1 --identifier jbt4bv7e4v7yykjy5fnfuejab4
aws dsql delete-cluster --region ap-northeast-2 --identifier 75t4bwipa7ile564wr7bnwhppy
```

(DSQL is serverless/pay-per-use, so idle cost is minimal — but delete after the demo to be tidy.)
