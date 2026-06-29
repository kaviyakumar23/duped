import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";

/**
 * Aurora DSQL connection (truth core). DSQL requires IAM auth with time-bound tokens; the
 * connector generates/refreshes them automatically — there is NEVER a password in code.
 *
 * Credentials:
 *  - On Vercel: use Vercel OIDC Federation (`awsCredentialsProvider`) to assume AWS_ROLE_ARN.
 *  - Locally (tsx scripts, `next dev` without OIDC): fall back to the connector's default AWS
 *    credential chain (AWS CLI / SSO / env), so `db:migrate`, `db:seed`, `swarm` just work.
 *
 * The connector extends node-postgres' Pool, so the commit kernel uses raw pg semantics
 * (BEGIN/COMMIT/ROLLBACK + conditional UPDATE with rowCount). See CLAUDE.md §2.
 */

export interface DsqlPoolOptions {
  /** DSQL cluster hostname (regional endpoint). */
  host: string;
  /** Human label for logs (e.g. "primary"/"tokyo"). */
  label?: string;
  user?: string;
  database?: string;
  port?: number;
  max?: number;
}

function onVercelWithOidc(): boolean {
  return Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

export function createDsqlPool(opts: DsqlPoolOptions): AuroraDSQLPool {
  const region = process.env.AWS_REGION; // auto-detected from host if omitted

  // Lazily build the OIDC credentials provider only on Vercel. Importing it locally is fine,
  // but it requires VERCEL_OIDC_TOKEN to actually mint credentials, so we branch.
  let customCredentialsProvider: unknown = undefined;
  if (onVercelWithOidc()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { awsCredentialsProvider } = require("@vercel/functions/oidc");
    customCredentialsProvider = awsCredentialsProvider({
      roleArn: process.env.AWS_ROLE_ARN!,
      clientConfig: { region },
    });
  }

  const pool = new AuroraDSQLPool({
    host: opts.host,
    user: opts.user ?? process.env.PGUSER ?? "admin",
    database: opts.database ?? process.env.PGDATABASE ?? "postgres",
    port: opts.port ?? Number(process.env.PGPORT ?? 5432),
    // Default 10; the swarm sets DSQL_POOL_MAX higher so many commits run concurrently and
    // generate genuine OCC (40001) contention to demonstrate. Keep modest in serverless.
    max: opts.max ?? Number(process.env.DSQL_POOL_MAX ?? 10),
    idleTimeoutMillis: 60_000,
    // Fail a starved checkout fast rather than hanging forever (defense-in-depth vs. pool stalls).
    connectionTimeoutMillis: 10_000,
    ...(region ? { region } : {}),
    ...(customCredentialsProvider ? { customCredentialsProvider } : {}),
  } as ConstructorParameters<typeof AuroraDSQLPool>[0]);

  // CRITICAL: a pg Pool with no 'error' listener crashes the process on an idle-client error
  // (TLS timeout, network drop, or a region we just failed away from). Swallow it — these are
  // non-fatal; the active endpoint keeps serving.
  pool.on("error", (err: Error) => {
    console.warn(`[dsql:${opts.label ?? "pool"}] idle client error (non-fatal): ${err.message}`);
  });

  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serverless DNS guard — pre-warming the pool.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DSQL mints a fresh IAM auth token per new connection, and each mint does an STS DNS lookup
 * (`sts.<region>.amazonaws.com`). When a swarm opens many connections at once, those `getaddrinfo`
 * calls fire concurrently and Vercel's resolver returns `EBUSY` — the whole storm fails. These are
 * transient and worth a short retry.
 */
const TRANSIENT_NET = /EBUSY|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|ECONNRESET|getaddrinfo/i;

function isTransientNetError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  const msg = (err as { message?: unknown } | null)?.message;
  return (
    (typeof code === "string" && TRANSIENT_NET.test(code)) ||
    (typeof msg === "string" && TRANSIENT_NET.test(msg))
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pre-open up to `n` connections on `pool` SEQUENTIALLY (one `await` at a time) so the per-connection
 * DSQL token mints — each an STS DNS lookup — never fire concurrently and trip `getaddrinfo EBUSY`
 * on Vercel. Connections are held until all are open (forcing the pool to create distinct ones), then
 * released, leaving `n` warm idle connections the swarm reuses with zero new mints. A stray transient
 * DNS error is retried with a short backoff. Best-effort: never throws; returns how many it warmed.
 *
 * Cap `n` at the pool's max (DSQL_POOL_MAX, default 10) — asking for more than max would block the
 * extra `connect()` calls (no client can free up while we hold them) until the checkout timeout.
 */
export async function warmPool(pool: AuroraDSQLPool, n: number): Promise<number> {
  const held: PoolClient[] = [];
  try {
    for (let i = 0; i < n; i++) {
      let placed = false;
      for (let attempt = 1; attempt <= 4 && !placed; attempt++) {
        let client: PoolClient | undefined;
        try {
          client = (await pool.connect()) as unknown as PoolClient;
          // CRITICAL: the connector mints the DSQL token LAZILY on the first query, not on
          // connect(). Run a trivial query here so this connection authenticates NOW, while we hold
          // it and the loop is serial — otherwise all N tokens would mint at once during the burst.
          await client.query("SELECT 1");
          held.push(client);
          placed = true;
        } catch (err) {
          // Destroy the half-open client (pass the error) so the pool won't hand it back broken.
          if (client) {
            try {
              client.release(err as Error);
            } catch {
              /* ignore */
            }
          }
          if (!isTransientNetError(err) || attempt === 4) break; // give up this slot, keep the rest
          await delay(100 * attempt);
        }
      }
      if (!placed) break; // can't grow further right now — warm what we have
    }
    return held.length;
  } finally {
    for (const c of held) {
      try {
        c.release();
      } catch {
        /* ignore — releasing a warm client never matters */
      }
    }
  }
}
