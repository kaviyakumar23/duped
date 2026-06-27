/**
 * Ensure the DynamoDB table exists with the schema Duped's live WORLD read model requires:
 *   - Partition key  pk  (String)
 *   - Sort key       sk  (String)
 *   - Billing        PAY_PER_REQUEST (on-demand)
 *
 * Single-table design (keys defined in lib/world/keys.ts): the settlement-feed EVENT items
 * (sk="EVENT#<createdAt>#<id>"), the ITEM projection (sk="ITEM#<instanceId>" — the legendary's
 * live owner/region/version), and the REALM projection (sk="PROJECTION#REALM" — cumulative
 * counters) all share a realm partition (pk="REALM#<realmId>"). The dashboard feed queries
 * begins_with(sk,"EVENT#") — which REQUIRES the sort key.
 *
 * Idempotent: creates the table if missing, verifies the key schema if it already exists.
 * Run once after provisioning (before the projector): `pnpm db:setup-ddb`.
 */
import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { ddbClient, DDB_TABLE } from "../lib/db/ddb.js";

async function describe(table: string) {
  try {
    const res = await ddbClient.send(new DescribeTableCommand({ TableName: table }));
    return res.Table ?? null;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return null;
    throw err;
  }
}

function keySchemaOk(table: Awaited<ReturnType<typeof describe>>): boolean {
  const ks = table?.KeySchema ?? [];
  const attrs = new Map((table?.AttributeDefinitions ?? []).map((a) => [a.AttributeName, a.AttributeType]));
  const hash = ks.find((k) => k.KeyType === "HASH")?.AttributeName;
  const range = ks.find((k) => k.KeyType === "RANGE")?.AttributeName;
  return hash === "pk" && range === "sk" && attrs.get("pk") === "S" && attrs.get("sk") === "S";
}

async function main() {
  const table = DDB_TABLE;
  console.log(`Ensuring DynamoDB table "${table}" (pk:S HASH, sk:S RANGE, on-demand)…`);

  const existing = await describe(table);
  if (existing) {
    if (keySchemaOk(existing)) {
      console.log(`✓ Table "${table}" already exists with the correct pk/sk schema.`);
      return;
    }
    console.error(
      `✗ Table "${table}" exists but its key schema is NOT (pk:S, sk:S).\n` +
        `  Found: ${JSON.stringify(existing.KeySchema)} / ${JSON.stringify(existing.AttributeDefinitions)}\n` +
        `  Fix: either point DYNAMODB_TABLE_NAME at a table you create with this schema, or\n` +
        `  delete/recreate the table. Duped's single-table world read model needs pk + sk.`,
    );
    process.exit(1);
  }

  await ddbClient.send(
    new CreateTableCommand({
      TableName: table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
    }),
  );
  console.log(`  …created, waiting for ACTIVE…`);
  await waitUntilTableExists({ client: ddbClient, maxWaitTime: 120 }, { TableName: table });
  console.log(`✓ Table "${table}" is ACTIVE.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
