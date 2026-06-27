import { projectOnce } from "../lib/outbox/projector.js";

/**
 * Long-running outbox projector for the Duped demo (`pnpm projector`). Polls the DSQL `world_outbox`
 * every ~500ms, draining unpublished TRADE_SETTLED rows into the DynamoDB world read model (the
 * legendary's live location, the settlement feed, the per-region counters). Errors are logged and
 * swallowed so a transient blip (network, throttle) never crashes the loop — the next tick retries,
 * and delivery is at-least-once by design (the projector's writes are idempotent/monotonic).
 *
 * The Vercel Cron route (app/api/internal/cron/project) is the production backstop; this is the
 * always-on worker for the live storm demo.
 */

const POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`[projector] starting — polling every ${POLL_INTERVAL_MS}ms`);
  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  let totalProcessed = 0;
  while (running) {
    try {
      const processed = await projectOnce();
      if (processed > 0) {
        totalProcessed += processed;
        console.log(`[projector] projected ${processed} event(s) (total ${totalProcessed})`);
      }
    } catch (err) {
      console.error("[projector] batch failed; continuing:", err);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  console.log(`[projector] stopped — projected ${totalProcessed} event(s) total`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[projector] fatal:", err);
  process.exit(1);
});
