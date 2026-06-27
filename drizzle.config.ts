import type { Config } from "drizzle-kit";

// Drizzle is used for SCHEMA DEFINITION + simple read queries only.
// Migrations are applied by `scripts/migrate.ts` (statement-by-statement) because Aurora
// DSQL forbids mixing DDL + DML and allows only one DDL per transaction. We do NOT use
// `drizzle-kit migrate` against DSQL — see CLAUDE.md §2.
export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
} satisfies Config;
