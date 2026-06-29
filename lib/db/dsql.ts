import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

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

// ─────────────────────────────────────────────────────────────────────────────
// THE FIX FOR `getaddrinfo EBUSY sts.<region>.amazonaws.com` UNDER LOAD.
//
// The connector regenerates the DSQL auth token on EVERY pool.connect() (one per checkout), and
// each token gen builds a fresh DsqlSigner that RESOLVES THE CREDENTIALS PROVIDER. Vercel's
// `awsCredentialsProvider` is NOT memoized, so every resolve does an STS AssumeRoleWithWebIdentity —
// a DNS lookup to sts.<region>. A burst of concurrent checkouts (the swarm) therefore fires a burst
// of concurrent getaddrinfo calls, and Vercel's resolver returns EBUSY once enough land at once,
// 500-ing the whole storm.
//
// Memoize the credentials: collapse all concurrent cold resolves onto ONE shared in-flight
// AssumeRole, and cache the result until shortly before it expires. The DNS storm becomes a single
// lookup; subsequent token gens sign locally with cached creds (no network, no DNS). Shared at module
// scope so every pool (primary + secondary) reuses the same credentials — they assume the same role.
// ─────────────────────────────────────────────────────────────────────────────

interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date | string;
  [k: string]: unknown;
}
type CredentialsProvider = () => Promise<AwsCreds>;

let sharedVercelProvider: CredentialsProvider | undefined;

function memoizedVercelCredentialsProvider(region: string | undefined): CredentialsProvider {
  if (sharedVercelProvider) return sharedVercelProvider;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { awsCredentialsProvider } = require("@vercel/functions/oidc");
  const base: CredentialsProvider = awsCredentialsProvider({
    roleArn: process.env.AWS_ROLE_ARN!,
    clientConfig: { region },
  });

  let cached: AwsCreds | null = null;
  let expiresAtMs = 0;
  let inFlight: Promise<AwsCreds> | null = null;

  sharedVercelProvider = () => {
    const now = Date.now();
    if (cached && now < expiresAtMs) return Promise.resolve(cached);
    // Coalesce concurrent cold resolves onto a single AssumeRole (one STS DNS lookup, not N).
    if (!inFlight) {
      inFlight = Promise.resolve(base())
        .then((creds) => {
          cached = creds;
          const exp = creds.expiration ? new Date(creds.expiration).getTime() : now + 15 * 60_000;
          expiresAtMs = exp - 60_000; // refresh a minute early
          inFlight = null;
          return creds;
        })
        .catch((err) => {
          inFlight = null; // let the next caller retry a failed resolve
          throw err;
        });
    }
    return inFlight;
  };
  return sharedVercelProvider;
}

export function createDsqlPool(opts: DsqlPoolOptions): AuroraDSQLPool {
  const region = process.env.AWS_REGION; // auto-detected from host if omitted

  // Build the OIDC credentials provider only on Vercel (it needs VERCEL_OIDC_TOKEN to mint creds).
  // Memoized so a burst of token generations shares one cached AssumeRole instead of stampeding STS.
  let customCredentialsProvider: unknown = undefined;
  if (onVercelWithOidc()) {
    customCredentialsProvider = memoizedVercelCredentialsProvider(region);
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
