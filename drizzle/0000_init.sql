-- Duped initial schema for Aurora DSQL — a globally consistent economy kernel for online games.
-- Applied by `scripts/migrate.ts` ONE STATEMENT AT A TIME (DSQL: one DDL per txn, no DDL+DML mix).
-- No FOREIGN KEYs (unsupported). Indexes are built with CREATE INDEX ASYNC. UUID PKs are app-supplied.
--
-- TWO KINDS OF ECONOMIC OBJECT, protected two different ways (see CLAUDE.md §6):
--   * UNIQUE items  -> item_instances : exactly ONE row per item; ownership moves only via a
--                       version-guarded conditional UPDATE. "Owned twice" has no representation.
--   * FUNGIBLE gold -> currency_shards + economy_ledger_* : conserved balances (CHECK >= 0) plus a
--                       balanced double-entry ledger that nets to zero. No inflation from dupes.

CREATE TABLE IF NOT EXISTS realms (
  realm_id   UUID PRIMARY KEY,
  realm_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
  player_id   TEXT PRIMARY KEY,
  realm_id    UUID NOT NULL,
  handle      TEXT NOT NULL,
  home_region TEXT NOT NULL CHECK (home_region IN ('TOKYO','SEOUL')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_templates (
  template_id UUID PRIMARY KEY,
  realm_id    UUID NOT NULL,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  rarity      TEXT NOT NULL CHECK (rarity IN ('COMMON','RARE','EPIC','LEGENDARY')),
  fungible    BOOLEAN NOT NULL,
  max_stack   INTEGER NOT NULL CHECK (max_stack > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- THE HEART. Every unique item is exactly one row keyed by instance_id. There is exactly one
-- owner column. To MOVE an item you must conditionally match its current (owner, version); the
-- UPDATE bumps version so two concurrent transfers can never both succeed. The authoritative state
-- has no way to represent two owners of one instance — uniqueness is structural, not a check.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_instances (
  instance_id UUID PRIMARY KEY,                 -- exactly one row per unique item
  template_id UUID NOT NULL,
  realm_id    UUID NOT NULL,
  owner_type  TEXT NOT NULL CHECK (owner_type IN ('PLAYER','WORLD','ESCROW','MAIL')),
  owner_id    TEXT NOT NULL,                    -- the single current holder
  region      TEXT NOT NULL CHECK (region IN ('TOKYO','SEOUL')),  -- where it currently lives
  version     BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),     -- optimistic ownership guard
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FUNGIBLE currency balances, sharded per (player, currency) so a whale or the treasury is never a
-- hot row under the gold double-spend storm. Structural no-overspend: a shard can't go negative.
CREATE TABLE IF NOT EXISTS currency_shards (
  shard_id      UUID PRIMARY KEY,
  realm_id      UUID NOT NULL,
  player_id     TEXT NOT NULL,
  currency      TEXT NOT NULL,
  balance_minor BIGINT NOT NULL CHECK (balance_minor >= 0),
  shard_no      INTEGER NOT NULL CHECK (shard_no >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_moved_at TIMESTAMPTZ
);

-- FUNGIBLE stackable items (potions, mats), sharded per (player, template). Same conserved-balance
-- pattern as gold; included for model completeness. Unique items NEVER live here.
CREATE TABLE IF NOT EXISTS stack_holdings (
  holding_id    UUID PRIMARY KEY,
  realm_id      UUID NOT NULL,
  player_id     TEXT NOT NULL,
  template_id   UUID NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  shard_no      INTEGER NOT NULL CHECK (shard_no >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_moved_at TIMESTAMPTZ
);

-- Two-sided atomic exchange header — one row per kernel call (trade / drop / pickup / mail).
CREATE TABLE IF NOT EXISTS trades (
  trade_id        UUID PRIMARY KEY,
  realm_id        UUID NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('TRADE','DROP','PICKUP','MAIL')),
  player_a        TEXT NOT NULL,
  player_b        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('PENDING','COMMITTED','DECLINED','FAILED')),
  item_count      INTEGER NOT NULL DEFAULT 0,
  gold_minor      BIGINT NOT NULL DEFAULT 0,
  region          TEXT NOT NULL CHECK (region IN ('TOKYO','SEOUL')),
  failure_code    TEXT,
  request_hash    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at    TIMESTAMPTZ
);

-- Append-only provenance for unique items. AUDIT ONLY — uniqueness is enforced by the
-- item_instances row + version guard, NOT by this log. Powers "the sword's complete history".
CREATE TABLE IF NOT EXISTS item_moves (
  move_id         UUID PRIMARY KEY,
  realm_id        UUID NOT NULL,
  instance_id     UUID NOT NULL,
  trade_id        UUID,
  move_kind       TEXT NOT NULL CHECK (move_kind IN ('MINT','TRADE','DROP','PICKUP','MAIL')),
  from_owner_type TEXT,
  from_owner_id   TEXT,
  to_owner_type   TEXT NOT NULL,
  to_owner_id     TEXT NOT NULL,
  from_region     TEXT,
  to_region       TEXT NOT NULL,
  version_after   BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Double-entry ledger over GOLD only (never unique items). Every gold move writes legs that net to
-- zero: SUM(signed_amount_minor)=0 globally is the provable "no gold inflation" invariant.
CREATE TABLE IF NOT EXISTS economy_ledger_transactions (
  ledger_txn_id UUID PRIMARY KEY,
  realm_id      UUID NOT NULL,
  trade_id      UUID NOT NULL,
  currency      TEXT NOT NULL,
  description   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS economy_ledger_entries (
  entry_id            UUID PRIMARY KEY,
  ledger_txn_id       UUID NOT NULL,
  line_no             INTEGER NOT NULL CHECK (line_no > 0),
  player_id           TEXT NOT NULL,                  -- whose balance moved (the "account")
  currency            TEXT NOT NULL,
  signed_amount_minor BIGINT NOT NULL CHECK (signed_amount_minor <> 0),
  trade_id            UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Exactly-once guard on a trade's idempotency key. UNIQUE index below is the structural dedupe.
CREATE TABLE IF NOT EXISTS trade_idempotency (
  registry_id       UUID PRIMARY KEY,
  realm_id          UUID NOT NULL,
  idempotency_key   TEXT NOT NULL,
  request_hash      TEXT NOT NULL,
  trade_id          UUID NOT NULL,
  final_status      TEXT NOT NULL CHECK (final_status IN ('COMMITTED','DECLINED','FAILED')),
  response_snapshot JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        TIMESTAMPTZ NOT NULL
);

-- Transactional outbox — events written INSIDE the trade txn, projected async into the DynamoDB
-- live world read model (legendary location/owner, region health, settlement feed, invariants).
CREATE TABLE IF NOT EXISTS world_outbox (
  event_id       UUID PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id   UUID NOT NULL,
  event_type     TEXT NOT NULL,
  payload        JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at   TIMESTAMPTZ
);

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- THE DELIBERATELY-BROKEN model — for the contrast demo ONLY (NOT part of the authoritative state).
-- A naive game tracks ownership as append/remove inventory rows with NO uniqueness and NO version
-- guard. A trade race then reads "A owns X", and two concurrent trades both INSERT a new owner
-- before the old row is removed → TWO owners of one item → a DUPE. count(*) here can exceed 1 — that
-- is the 25-year-old bug, reproduced on camera. Duped's item_instances makes that unrepresentable.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legacy_inventory (
  entry_id    UUID PRIMARY KEY,
  realm_id    UUID NOT NULL,
  instance_id UUID NOT NULL,        -- NO unique constraint: many rows per instance can exist (the bug)
  owner_id    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Async indexes (DSQL builds indexes asynchronously). The migrate runner tolerates "already exists".
CREATE INDEX ASYNC ix_legacy_inventory_instance ON legacy_inventory (instance_id);
-- The two UNIQUE indexes on idempotency are the structural exactly-once guard.
CREATE UNIQUE INDEX ASYNC uq_item_templates_realm_code ON item_templates (realm_id, code);
CREATE INDEX ASYNC ix_item_instances_template ON item_instances (template_id);
CREATE INDEX ASYNC ix_item_instances_owner ON item_instances (owner_type, owner_id);
CREATE INDEX ASYNC ix_item_instances_realm ON item_instances (realm_id);
CREATE UNIQUE INDEX ASYNC uq_currency_shards_player_currency_no ON currency_shards (player_id, currency, shard_no);
CREATE INDEX ASYNC ix_currency_shards_player_currency ON currency_shards (player_id, currency);
CREATE INDEX ASYNC ix_currency_shards_currency ON currency_shards (currency);
CREATE UNIQUE INDEX ASYNC uq_stack_holdings_player_template_no ON stack_holdings (player_id, template_id, shard_no);
CREATE UNIQUE INDEX ASYNC uq_trades_realm_idem ON trades (realm_id, idempotency_key);
CREATE INDEX ASYNC ix_trades_realm_created ON trades (realm_id, created_at);
CREATE UNIQUE INDEX ASYNC uq_trade_idempotency_realm_idem ON trade_idempotency (realm_id, idempotency_key);
CREATE INDEX ASYNC ix_item_moves_instance ON item_moves (instance_id);
CREATE INDEX ASYNC ix_item_moves_realm_created ON item_moves (realm_id, created_at);
CREATE INDEX ASYNC ix_ledger_entries_txn ON economy_ledger_entries (ledger_txn_id);
CREATE INDEX ASYNC ix_outbox_unpublished ON world_outbox (published_at);
