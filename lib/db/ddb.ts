import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * DynamoDB (read-scaled event sidecar). Holds the catalog cache, event log, and dashboard
 * projections — the read plane. Writes here come ONLY from the outbox projector (idempotent
 * PutItem), never from inside the commit txn.
 *
 * Auth mirrors DSQL: Vercel OIDC on the platform, default AWS credential chain locally.
 */

// The DynamoDB Marketplace integration is connected with the env-var prefix `DDB_` so its generic
// AWS_* vars (AWS_ACCOUNT_ID/AWS_REGION/AWS_ROLE_ARN) don't collide with the DSQL integration on
// the same Vercel project. Prefer the prefixed vars; fall back to unprefixed for a single-account
// setup or local dev. DSQL has its OWN role (AWS_ROLE_ARN) — these point at DynamoDB's role.
const DDB_REGION = process.env.DDB_AWS_REGION ?? process.env.AWS_REGION;
const DDB_ROLE_ARN = process.env.DDB_AWS_ROLE_ARN ?? process.env.AWS_ROLE_ARN;

function buildCredentials(): unknown {
  if (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { awsCredentialsProvider } = require("@vercel/functions/oidc");
    return awsCredentialsProvider({
      roleArn: DDB_ROLE_ARN!,
      clientConfig: { region: DDB_REGION },
    });
  }
  return undefined; // SDK default chain (AWS CLI / SSO / env) for local tooling
}

const credentials = buildCredentials();

const client = new DynamoDBClient({
  region: DDB_REGION,
  ...(credentials ? { credentials: credentials as never } : {}),
});

/** Low-level client, exported for table administration (CreateTable in scripts/setup-ddb.ts). */
export const ddbClient = client;

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

/** The single DynamoDB table (single-table design). Partition/sort keys encode the entity. */
export const DDB_TABLE =
  process.env.DDB_DYNAMODB_TABLE_NAME ?? process.env.DYNAMODB_TABLE_NAME ?? "duped";
