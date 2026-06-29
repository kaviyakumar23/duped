import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";
import pLimit from "p-limit";

/**
 * THE DNS GUARD. The DSQL connector regenerates the IAM auth token on EVERY `pool.connect()` (it
 * sets `options.password = await getDSQLToken()` before each checkout). At cold start each token
 * generation does an STS `AssumeRole` → a `getaddrinfo` to `sts.<region>.amazonaws.com`. A burst of
 * concurrent checkouts (the swarm) therefore fires N concurrent DNS lookups, and Vercel's resolver
 * returns `EBUSY` once N is large — failing the whole storm. We cap CONCURRENT checkouts (not job
 * concurrency) with a shared limiter, so token generation never stampedes DNS; the kernel still runs
 * its jobs at full concurrency and produces genuine OCC contention. Shared across all pools because
 * every pool resolves the same STS host. Tunable via DSQL_CONNECT_CONCURRENCY (default 3).
 */
const connectLimit = pLimit(Math.max(1, Number(process.env.DSQL_CONNECT_CONCURRENCY ?? 3)));

type ConnectCallback = (
  err: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

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

  // Route every checkout (both the promise form used by the kernel's transactions AND the callback
  // form pg uses internally for pool.query) through the shared limiter, so the connector's
  // per-checkout token generation can't fire more than DSQL_CONNECT_CONCURRENCY STS lookups at once.
  const rawConnect = pool.connect.bind(pool) as {
    (): Promise<PoolClient>;
    (cb: ConnectCallback): void;
  };

  function limitedConnect(): Promise<PoolClient>;
  function limitedConnect(cb: ConnectCallback): void;
  function limitedConnect(cb?: ConnectCallback): Promise<PoolClient> | void {
    if (cb) {
      // Callback form: hold a limiter slot until the connection is acquired (cb invoked), then free
      // it — the caller releases the client later, independently of the throttle.
      void connectLimit(
        () =>
          new Promise<void>((resolve) => {
            rawConnect((err, client, done) => {
              try {
                cb(err, client, done);
              } finally {
                resolve();
              }
            });
          }),
      );
      return;
    }
    return connectLimit(() => rawConnect());
  }

  (pool as unknown as { connect: typeof limitedConnect }).connect = limitedConnect;

  return pool;
}
