/**
 * OCC retry policy. Aurora DSQL surfaces write conflicts at COMMIT as SQLSTATE 40001. We do NOT
 * hide these — they're expected under contention and we engineered for them. The trade kernel
 * retries with the SAME idempotency key and jittered exponential backoff. Retry counts are
 * surfaced to the world console / video as proof we built for DSQL's optimistic-concurrency model.
 */

export const MAX_TRADE_ATTEMPTS = 15;

const BASE_DELAY_MS = 3;
const MAX_DELAY_MS = 120;

/** Full-jitter exponential backoff: random in [0, min(MAX, base * 2^(attempt-1))]. */
export function jitteredBackoffMs(attempt: number): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * ceiling);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fisher–Yates shuffle (returns a new array). Used to randomize gold-shard claim order. */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = input.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
