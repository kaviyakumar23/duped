/**
 * Read-only connectivity check for Duped. Proves the local credentials can reach both planes WITHOUT
 * writing anything: a `SELECT NOW()` on the Aurora DSQL truth core and a GetItem on a non-existent
 * key in the DynamoDB world read model. Run: `pnpm db:check` (loads .env.local).
 */
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { getPool } from "../lib/db/region-router.js";
import { ddb, DDB_TABLE } from "../lib/db/ddb.js";

async function main() {
  const pool = getPool("primary");
  const r = await pool.query("SELECT NOW() AS now, current_user AS who");
  console.log(`✓ DSQL connected — now=${r.rows[0].now}, user=${r.rows[0].who}`);

  const g = await ddb.send(
    new GetCommand({ TableName: DDB_TABLE, Key: { pk: "HEALTHCHECK", sk: "none" } }),
  );
  console.log(`✓ DynamoDB reachable — table=${DDB_TABLE}, probe item=${g.Item ? "found" : "(none, expected)"}`);

  await pool.end();
  console.log("✓ connectivity OK (read-only, nothing written)");
}

main().catch((err) => {
  console.error("✗ CHECK FAILED:", err?.message ?? err);
  process.exit(1);
});
