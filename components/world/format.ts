/** World-specific display helpers. Gold is ALWAYS integer minor units; 1 gold = 100 minor. */
import { formatInt, formatCompact } from "@/lib/format";

export { formatInt, formatCompact };

/** Render minor-unit gold as whole gold with a trailing "g" (e.g. 600000 → "6,000 g"). */
export function formatGold(minor: number | undefined): string {
  const g = (minor ?? 0) / 100;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(g)} g`;
}

/** Compact gold for big readouts (e.g. 600000 → "6k g"). */
export function formatGoldCompact(minor: number | undefined): string {
  return `${formatCompact((minor ?? 0) / 100)} g`;
}

/** A short, friendly handle. Trims long player ids / world owners for chips. */
export function handleLabel(handle: string | undefined): string {
  if (!handle) return "—";
  if (handle.length <= 18) return handle;
  return `${handle.slice(0, 16)}…`;
}

/** Local clock time HH:MM:SS for feed rows. */
export function clockTime(iso: string | undefined): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
