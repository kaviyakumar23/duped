/**
 * Reset the DynamoDB world read model for the demo realm — deletes the REALM projection, the ITEM
 * projection(s), and all EVENT feed rows so a fresh storm shows accurate counters (DSQL is reset by
 * `db:seed`; this resets the read-model sidecar). Run between demo runs: `pnpm db:reset-ddb`.
 */
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, DDB_TABLE } from "../lib/db/ddb.js";
import { DEMO } from "../lib/demo/config.js";
import { ddbKeys } from "../lib/world/keys.js";

const pk = ddbKeys.realmPk(DEMO.realmId);
let deleted = 0;
let lastKey: Record<string, unknown> | undefined;

do {
  const res = await ddb.send(
    new QueryCommand({
      TableName: DDB_TABLE,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ExclusiveStartKey: lastKey,
    }),
  );
  for (const item of res.Items ?? []) {
    await ddb.send(new DeleteCommand({ TableName: DDB_TABLE, Key: { pk: item.pk, sk: item.sk } }));
    deleted++;
  }
  lastKey = res.LastEvaluatedKey;
} while (lastKey);

console.log(`reset-ddb: deleted ${deleted} item(s) under ${pk}`);
process.exit(0);
