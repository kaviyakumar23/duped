import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Duped schema for Aurora DSQL (PostgreSQL-compatible subset) — a globally consistent economy
 * kernel for online games.
 *
 * DSQL constraints honored here (see CLAUDE.md §3):
 *  - NO FOREIGN KEYs — only CHECK / UNIQUE / PRIMARY KEY. Referential integrity lives in the
 *    service layer + audit queries.
 *  - Money is BIGINT minor units. UUID PKs supplied by the app (not a DB sequence).
 *  - Indexes are built ASYNC by `drizzle/0000_init.sql`, NOT by drizzle-kit. That SQL is the
 *    authoritative DDL; this file is the source of truth for SCHEMA TYPES + simple reads.
 *
 * Two kinds of object, two protections:
 *  - item_instances  : ONE row per unique item, version-guarded transfer (exactly-one-owner).
 *  - currency_shards : conserved gold balances, sharded; economy_ledger_* is the balanced audit.
 */

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const realms = pgTable("realms", {
  realmId: uuid("realm_id").primaryKey(),
  realmName: text("realm_name").notNull(),
  createdAt: createdAt(),
});

export const players = pgTable("players", {
  playerId: text("player_id").primaryKey(),
  realmId: uuid("realm_id").notNull(),
  handle: text("handle").notNull(),
  homeRegion: text("home_region").notNull(),
  createdAt: createdAt(),
});

export const itemTemplates = pgTable("item_templates", {
  templateId: uuid("template_id").primaryKey(),
  realmId: uuid("realm_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  rarity: text("rarity").notNull(),
  fungible: boolean("fungible").notNull(),
  maxStack: integer("max_stack").notNull(),
  createdAt: createdAt(),
});

/**
 * item_instances — the structural exactly-one-owner guarantee. One row per unique item; the
 * version column is the optimistic ownership guard. Two concurrent transfers cannot both match
 * `owner_id = :from AND version = :expected`, so exactly one wins. See lib/kernel/transfer.ts.
 */
export const itemInstances = pgTable(
  "item_instances",
  {
    instanceId: uuid("instance_id").primaryKey(),
    templateId: uuid("template_id").notNull(),
    realmId: uuid("realm_id").notNull(),
    ownerType: text("owner_type").notNull(),
    ownerId: text("owner_id").notNull(),
    region: text("region").notNull(),
    version: bigint("version", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("ck_instance_owner_type", sql`${t.ownerType} IN ('PLAYER','WORLD','ESCROW','MAIL')`),
    check("ck_instance_region", sql`${t.region} IN ('TOKYO','SEOUL')`),
    check("ck_instance_version_nonneg", sql`${t.version} >= 0`),
  ],
);

/** Conserved gold balances, sharded per (player, currency). A shard can never go negative. */
export const currencyShards = pgTable(
  "currency_shards",
  {
    shardId: uuid("shard_id").primaryKey(),
    realmId: uuid("realm_id").notNull(),
    playerId: text("player_id").notNull(),
    currency: text("currency").notNull(),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    shardNo: integer("shard_no").notNull(),
    createdAt: createdAt(),
    lastMovedAt: timestamp("last_moved_at", { withTimezone: true }),
  },
  (t) => [
    // The structural no-overspend guarantee, sharded: no balance shard can go negative.
    check("ck_shard_balance_nonneg", sql`${t.balanceMinor} >= 0`),
    check("ck_shard_no_nonneg", sql`${t.shardNo} >= 0`),
  ],
);

export const stackHoldings = pgTable(
  "stack_holdings",
  {
    holdingId: uuid("holding_id").primaryKey(),
    realmId: uuid("realm_id").notNull(),
    playerId: text("player_id").notNull(),
    templateId: uuid("template_id").notNull(),
    quantity: integer("quantity").notNull(),
    shardNo: integer("shard_no").notNull(),
    createdAt: createdAt(),
    lastMovedAt: timestamp("last_moved_at", { withTimezone: true }),
  },
  (t) => [
    check("ck_stack_qty_nonneg", sql`${t.quantity} >= 0`),
    check("ck_stack_shard_no_nonneg", sql`${t.shardNo} >= 0`),
  ],
);

export const trades = pgTable(
  "trades",
  {
    tradeId: uuid("trade_id").primaryKey(),
    realmId: uuid("realm_id").notNull(),
    kind: text("kind").notNull(),
    playerA: text("player_a").notNull(),
    playerB: text("player_b").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    goldMinor: bigint("gold_minor", { mode: "number" }).notNull().default(0),
    region: text("region").notNull(),
    failureCode: text("failure_code"),
    requestHash: text("request_hash").notNull(),
    createdAt: createdAt(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (t) => [
    check("ck_trade_kind", sql`${t.kind} IN ('TRADE','DROP','PICKUP','MAIL')`),
    check("ck_trade_status", sql`${t.status} IN ('PENDING','COMMITTED','DECLINED','FAILED')`),
    check("ck_trade_region", sql`${t.region} IN ('TOKYO','SEOUL')`),
  ],
);

/** Append-only provenance for unique items — AUDIT ONLY (uniqueness is the item_instances row). */
export const itemMoves = pgTable("item_moves", {
  moveId: uuid("move_id").primaryKey(),
  realmId: uuid("realm_id").notNull(),
  instanceId: uuid("instance_id").notNull(),
  tradeId: uuid("trade_id"),
  moveKind: text("move_kind").notNull(),
  fromOwnerType: text("from_owner_type"),
  fromOwnerId: text("from_owner_id"),
  toOwnerType: text("to_owner_type").notNull(),
  toOwnerId: text("to_owner_id").notNull(),
  fromRegion: text("from_region"),
  toRegion: text("to_region").notNull(),
  versionAfter: bigint("version_after", { mode: "number" }).notNull(),
  createdAt: createdAt(),
});

export const economyLedgerTransactions = pgTable("economy_ledger_transactions", {
  ledgerTxnId: uuid("ledger_txn_id").primaryKey(),
  realmId: uuid("realm_id").notNull(),
  tradeId: uuid("trade_id").notNull(),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

export const economyLedgerEntries = pgTable(
  "economy_ledger_entries",
  {
    entryId: uuid("entry_id").primaryKey(),
    ledgerTxnId: uuid("ledger_txn_id").notNull(),
    lineNo: integer("line_no").notNull(),
    playerId: text("player_id").notNull(),
    currency: text("currency").notNull(),
    signedAmountMinor: bigint("signed_amount_minor", { mode: "number" }).notNull(),
    tradeId: uuid("trade_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("ck_ledger_line_pos", sql`${t.lineNo} > 0`),
    // Every gold leg moves money; a zero leg is meaningless and would break the balance invariant.
    check("ck_ledger_amount_nonzero", sql`${t.signedAmountMinor} <> 0`),
  ],
);

export const idempotencyRegistry = pgTable(
  "trade_idempotency",
  {
    registryId: uuid("registry_id").primaryKey(),
    realmId: uuid("realm_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    tradeId: uuid("trade_id").notNull(),
    finalStatus: text("final_status").notNull(),
    responseSnapshot: jsonb("response_snapshot").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("ck_registry_final_status", sql`${t.finalStatus} IN ('COMMITTED','DECLINED','FAILED')`),
  ],
);

export const eventOutbox = pgTable("world_outbox", {
  eventId: uuid("event_id").primaryKey(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});
