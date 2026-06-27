import type { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { createDsqlPool } from "./dsql";

/**
 * Region router — the abstraction behind the multi-region failover demo. A peered Aurora DSQL
 * cluster exposes two strongly-consistent regional endpoints over ONE logical database, both
 * open for concurrent reads+writes. We route the kernel's writes to the "active" endpoint; the
 * failover demo flips `active` mid-swarm and commits keep flowing through the survivor — still
 * strongly consistent, because it's the same logical DB.
 *
 * Dev (single-region, e.g. Mumbai): PGHOST_SECONDARY is unset, so both endpoints resolve to the
 * same host. The toggle still exercises the full failover code path for the UI/demo.
 *
 * Pools are created lazily and cached (module singletons survive across requests/warm lambdas).
 */

export type RegionKey = "primary" | "secondary";

interface RegionState {
  active: RegionKey;
  pools: Partial<Record<RegionKey, AuroraDSQLPool>>;
  hosts: Record<RegionKey, string>;
}

function hosts(): Record<RegionKey, string> {
  const primary = process.env.PGHOST;
  if (!primary) {
    throw new Error("PGHOST is not set — run `vercel env pull` (or set it for local scripts).");
  }
  const secondary = process.env.PGHOST_SECONDARY || primary; // dev falls back to primary
  return { primary, secondary };
}

// Use a global singleton so the active flag and pools persist across module reloads.
const g = globalThis as unknown as { __zerorace_region__?: RegionState };
function state(): RegionState {
  if (!g.__zerorace_region__) {
    g.__zerorace_region__ = { active: "primary", pools: {}, hosts: hosts() };
  }
  return g.__zerorace_region__;
}

export function getPool(region?: RegionKey): AuroraDSQLPool {
  const s = state();
  const key = region ?? s.active;
  if (!s.pools[key]) {
    s.pools[key] = createDsqlPool({ host: s.hosts[key], label: key });
  }
  return s.pools[key]!;
}

/** The currently active write endpoint. The kernel calls this. */
export function getActivePool(): AuroraDSQLPool {
  return getPool();
}

export function getActiveRegion(): RegionKey {
  return state().active;
}

/** Flip the active endpoint (the failover demo button). Returns the new active region. */
export function failoverTo(region: RegionKey): RegionKey {
  state().active = region;
  return region;
}

export function toggleRegion(): RegionKey {
  const s = state();
  return failoverTo(s.active === "primary" ? "secondary" : "primary");
}
