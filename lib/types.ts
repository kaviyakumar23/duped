/**
 * Shared contracts for the Duped economy kernel. Every backend module (kernel, transfer, API
 * routes, swarm, reconcile, tests) imports from here so column names, status strings, and the
 * response snapshot shape never drift. Money/gold is ALWAYS integer minor units (never floats).
 */

// ---- Enumerations (mirror the DSQL CHECK constraints) ----

export type TradeStatus = "PENDING" | "COMMITTED" | "DECLINED" | "FAILED";
export type RegistryFinalStatus = "COMMITTED" | "DECLINED" | "FAILED";

/** What kind of ownership move this kernel call represents (descriptive; all use the same guard). */
export type TradeKind = "TRADE" | "DROP" | "PICKUP" | "MAIL";

/** Who can hold a unique item. A "drop" parks it on WORLD; a trade-in-flight may sit in ESCROW. */
export type OwnerType = "PLAYER" | "WORLD" | "ESCROW" | "MAIL";

/** The two regions of the peered Aurora DSQL cluster (TOKYO = primary, SEOUL = secondary). */
export type Region = "TOKYO" | "SEOUL";

/** Provenance entry kinds for item_moves (audit log). */
export type MoveKind = "MINT" | TradeKind;

/** Reasons a trade is declined deterministically (a business outcome, NOT an error/throw). */
export type TradeFailureCode =
  | "ITEM_MOVED" // an item's (owner, version) no longer matches — someone already moved it
  | "INSUFFICIENT_FUNDS" // a gold leg couldn't be covered by the payer's balance
  | "ITEM_NOT_FOUND" // the instance row doesn't exist in this realm
  | "INVALID_REQUEST"; // structurally invalid leg set caught at runtime

// ---- Kernel I/O ----

/**
 * One unique-item ownership move within a trade. The kernel applies it as a single conditional
 * UPDATE: it must match the item's CURRENT (owner_type, owner_id, version) or the whole trade
 * declines with ITEM_MOVED. This is the structural anti-dupe guard.
 */
export interface ItemLeg {
  instanceId: string;
  /** The version the caller believes the item is at. Mismatch ⇒ someone moved it ⇒ ITEM_MOVED. */
  expectedVersion: number;
  fromOwnerType: OwnerType;
  fromOwnerId: string;
  toOwnerType: OwnerType;
  toOwnerId: string;
}

/** One fungible gold movement within a trade: debit `fromPlayerId`, credit `toPlayerId`. */
export interface GoldLeg {
  fromPlayerId: string;
  toPlayerId: string;
  amountMinor: number;
}

/**
 * A two-sided atomic exchange. `itemLegs` + `goldLegs` are applied all-or-nothing in one DSQL
 * transaction. A trade is just legs; a DROP/PICKUP/MAIL is the same machinery with WORLD/MAIL as
 * one side. `idempotencyKey` makes the whole thing exactly-once.
 */
export interface TradeRequest {
  realmId: string;
  /** Idempotency key — same key + same payload replays the stored snapshot. */
  idempotencyKey: string;
  kind: TradeKind;
  /** Display identities for the trade record (the two parties). */
  playerA: string;
  playerB: string;
  itemLegs: ItemLeg[];
  goldLegs: GoldLeg[];
  currency: string;
  /** Which regional DSQL endpoint settles this trade (TOKYO ⇒ primary, SEOUL ⇒ secondary). */
  region: Region;
}

export type TradeOutcome = "COMMITTED" | "DECLINED";

export interface MovedItem {
  instanceId: string;
  fromOwnerId: string;
  toOwnerId: string;
  versionAfter: number;
}

/**
 * The canonical, replay-safe response snapshot. Stored verbatim in trade_idempotency and
 * returned to the caller. Replaying the same key returns a byte-identical snapshot + `replayed:true`.
 */
export interface TradeSnapshot {
  outcome: TradeOutcome;
  tradeId: string;
  realmId: string;
  idempotencyKey: string;
  kind: TradeKind;
  playerA: string;
  playerB: string;
  region: Region;
  /** Unique items that changed hands (present on COMMITTED). */
  movedItems: MovedItem[];
  /** Total gold (minor units) that moved across all gold legs. */
  goldMovedMinor: number;
  /** Present on COMMITTED when any gold moved. */
  ledgerTxnId?: string;
  /** Present on DECLINED. */
  failureCode?: TradeFailureCode;
  /** Number of attempts the kernel made (1 + OCC 40001 retries). Surfaced, never hidden. */
  attempts: number;
  /** True when this response came from the idempotency registry rather than a fresh commit. */
  replayed: boolean;
  committedAt?: string;
}

// ---- Errors (mapped to HTTP status by the route layer) ----

export type KernelErrorCode =
  | "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" // -> 409
  | "RETRY_EXHAUSTED" // -> 503 (OCC 40001 storm beyond max attempts)
  | "VALIDATION_ERROR" // -> 400
  | "NOT_FOUND"; // -> 404

const HTTP_BY_CODE: Record<KernelErrorCode, number> = {
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: 409,
  RETRY_EXHAUSTED: 503,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
};

export class KernelError extends Error {
  readonly code: KernelErrorCode;
  readonly httpStatus: number;
  constructor(code: KernelErrorCode, message: string) {
    super(message);
    this.name = "KernelError";
    this.code = code;
    this.httpStatus = HTTP_BY_CODE[code];
  }
}

/** PostgreSQL/DSQL serialization failure — DSQL surfaces OCC write conflicts as this SQLSTATE. */
export const SQLSTATE_SERIALIZATION_FAILURE = "40001";

export function isSerializationFailure(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === SQLSTATE_SERIALIZATION_FAILURE
  );
}
