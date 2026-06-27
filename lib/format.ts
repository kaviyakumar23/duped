/** Display helpers. Money is ALWAYS integer minor units — format only at the render edge. */

export function formatUSD(minor: number | undefined, currency = "USD"): string {
  const value = (minor ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatInt(n: number | undefined): string {
  return new Intl.NumberFormat("en-US").format(Math.trunc(n ?? 0));
}

/** Compact like 12.4k for large counters. */
export function formatCompact(n: number | undefined): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    n ?? 0,
  );
}

export function shortId(id: string | undefined, head = 4, tail = 4): string {
  if (!id) return "—";
  const clean = id.replace(/[^a-z0-9]/gi, "");
  if (clean.length <= head + tail) return clean;
  return `${clean.slice(0, head)}…${clean.slice(-tail)}`;
}

export function relTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 1) return "now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
