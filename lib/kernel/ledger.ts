import { randomUUID } from "node:crypto";
import type { GoldLeg } from "../types";

/**
 * Double-entry ledger over GOLD (never unique items — a sword is not money). Each gold leg
 * (debit `from`, credit `to` by `amount`) writes two balanced entries:
 *   from  -amount   (gold leaves)
 *   to    +amount   (gold arrives)
 * Every transaction nets to zero, so SUM(signed_amount_minor) across ALL entries is the provable
 * "no gold inflation / drift = 0" invariant — one SQL query. See scripts/reconcile.ts.
 *
 * NOTE: this is the AUDIT record. The authoritative live balance is currency_shards (CHECK >= 0).
 * The ledger and the shards are written in the SAME transaction, so they can never disagree.
 */

export interface LedgerEntryRow {
  entryId: string;
  lineNo: number;
  playerId: string;
  currency: string;
  signedAmountMinor: number;
}

/** Flatten gold legs into balanced ledger entries with sequential line numbers (1..2N). */
export function buildGoldLedgerEntries(goldLegs: GoldLeg[], currency: string): LedgerEntryRow[] {
  const entries: LedgerEntryRow[] = [];
  let line = 1;
  for (const leg of goldLegs) {
    if (!Number.isInteger(leg.amountMinor) || leg.amountMinor <= 0) {
      // A zero/negative leg would violate the ledger CHECK and break the balance invariant.
      throw new Error(`buildGoldLedgerEntries: amountMinor must be a positive integer, got ${leg.amountMinor}`);
    }
    entries.push({
      entryId: randomUUID(),
      lineNo: line++,
      playerId: leg.fromPlayerId,
      currency,
      signedAmountMinor: -leg.amountMinor,
    });
    entries.push({
      entryId: randomUUID(),
      lineNo: line++,
      playerId: leg.toPlayerId,
      currency,
      signedAmountMinor: +leg.amountMinor,
    });
  }
  return entries;
}

/** Total gold (minor) that moves across all legs — recorded on the trade header for display. */
export function totalGoldMinor(goldLegs: GoldLeg[]): number {
  return goldLegs.reduce((sum, l) => sum + l.amountMinor, 0);
}
