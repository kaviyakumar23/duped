"use client";

import type { InvariantReport, WorldCounters, StormReport, GoldStormReport } from "./types";
import { formatInt, formatGold } from "./format";

/**
 * ECONOMY CONSOLE — the invariant board. Headline tiles trace to live counters + the latest storm
 * reports; below them, every invariant from invariants.results renders as a card with its expected
 * condition and a PASS/FAIL state. These are the SAME numbers the SQL proof returns.
 */
interface ConsoleProps {
  invariants: InvariantReport;
  counters: WorldCounters;
  storm: StormReport | null;
  gold: GoldStormReport | null;
}

export function EconomyConsole({ invariants, counters, storm, gold }: ConsoleProps) {
  const dupeBlocked = (storm?.dupeBlocked ?? 0) + counters.tradesDeclined;
  const occRetries = storm?.retriesTotal ?? 0;
  const goldConserved =
    gold == null || gold.goldSupplyBeforeMinor === gold.goldSupplyAfterMinor;

  return (
    <section
      className="duped-panel anim-fade-up"
      style={{ padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <Header
        eyebrow="Economy console"
        title="Live invariants from the Aurora DSQL truth core"
        ok={invariants.allPass}
      />

      {/* headline tiles */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 12,
        }}
      >
        <Tile
          big={formatInt(dupeBlocked)}
          label="Dupe attempts blocked"
          tone="rose"
          sub="version-guard + ledger"
        />
        <Tile big={formatInt(occRetries)} label="OCC retries" tone="violet" sub="40001 conflicts, retried" />
        <Tile
          big={formatInt(counters.tradesSettled)}
          label="Valid trades settled"
          tone="teal"
          sub="committed to truth core"
        />
        <Tile
          big={formatGold(invariants.goldSupplyMinor)}
          label="Gold supply"
          tone="gold"
          badge={invariants.allPass ? "conserved" : undefined}
          sub="Σ currency_shards"
        />
        <Tile
          big={formatInt(invariants.ledgerDriftMinor)}
          label="Ledger drift"
          tone={invariants.ledgerDriftMinor === 0 ? "teal" : "rose"}
          badge={invariants.ledgerDriftMinor === 0 ? "balanced" : undefined}
          sub="Σ signed entries = 0"
        />
      </div>

      {/* invariant board */}
      <div>
        <div
          className="kicker"
          style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>invariant board</span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
          <span style={{ color: goldConserved ? "var(--green)" : "var(--rose)" }}>
            {goldConserved ? "supply conserved" : "supply changed"}
          </span>
        </div>
        {invariants.results.length === 0 ? (
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
              padding: "20px 0",
              textAlign: "center",
            }}
          >
            connecting to the truth core…
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {invariants.results.map((r) => (
              <InvariantCard
                key={r.key}
                label={r.label}
                value={r.value}
                expected={r.expected}
                pass={r.pass}
                critical={r.critical}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Header({ eyebrow, title, ok }: { eyebrow: string; title: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div>
        <div className="kicker" style={{ color: "var(--teal)" }}>
          {eyebrow}
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 6 }}>
          {title}
        </div>
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          color: ok ? "var(--green)" : "var(--rose)",
          border: `1px solid ${ok ? "rgba(70,231,168,0.35)" : "rgba(255,93,124,0.4)"}`,
          background: ok ? "rgba(70,231,168,0.08)" : "rgba(255,93,124,0.08)",
          borderRadius: 999,
          padding: "6px 12px",
        }}
      >
        <span
          className="live-dot"
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: ok ? "var(--green)" : "var(--rose)",
            boxShadow: `0 0 8px ${ok ? "var(--green)" : "var(--rose)"}`,
          }}
        />
        {ok ? "ALL INVARIANTS HOLD" : "VIOLATION"}
      </div>
    </div>
  );
}

const TONES: Record<string, { color: string; glow: string }> = {
  teal: { color: "var(--teal)", glow: "rgba(47,240,207,0.16)" },
  violet: { color: "var(--violet)", glow: "rgba(157,128,255,0.16)" },
  gold: { color: "var(--gold)", glow: "rgba(255,207,99,0.16)" },
  rose: { color: "var(--rose)", glow: "rgba(255,93,124,0.16)" },
};

function Tile({
  big,
  label,
  tone,
  sub,
  badge,
}: {
  big: string;
  label: string;
  tone: keyof typeof TONES;
  sub: string;
  badge?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      style={{
        position: "relative",
        background: `radial-gradient(120% 100% at 0% 0%, ${t.glow}, transparent 70%), var(--panel-3)`,
        border: "1px solid var(--hairline)",
        borderRadius: 13,
        padding: "16px 16px 14px",
        overflow: "hidden",
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 34, fontWeight: 600, color: t.color, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        {big}
      </div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-mid)",
          marginTop: 12,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-faint)" }}>{sub}</span>
        {badge && (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--green)",
              border: "1px solid rgba(70,231,168,0.35)",
              borderRadius: 5,
              padding: "2px 6px",
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

function InvariantCard({
  label,
  value,
  expected,
  pass,
  critical,
}: {
  label: string;
  value: number;
  expected: string;
  pass: boolean;
  critical: boolean;
}) {
  const accent = pass ? "var(--green)" : "var(--rose)";
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: `1px solid ${pass ? "var(--hairline)" : "rgba(255,93,124,0.45)"}`,
        borderLeft: `2px solid ${accent}`,
        borderRadius: 11,
        padding: "13px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-hi)", lineHeight: 1.35 }}>{label}</span>
        <span
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: pass ? "rgba(70,231,168,0.14)" : "rgba(255,93,124,0.16)",
            color: accent,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {pass ? "✓" : "✕"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: accent }}>
          {formatInt(value)}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
          expects {expected}
        </span>
      </div>
      {critical && (
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8.5,
            letterSpacing: "0.16em",
            color: "var(--text-faint)",
            textTransform: "uppercase",
          }}
        >
          critical invariant
        </span>
      )}
    </div>
  );
}
