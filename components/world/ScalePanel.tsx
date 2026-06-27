"use client";

import type { MarketStormReport } from "./types";
import { formatInt } from "./format";

/**
 * SCALE PANEL — the million-scale beat. The page already proves CORRECTNESS (one legendary, never
 * duped). This tells the complementary SCALE story: the single legendary is one hot row → serial by
 * nature (which is WHY duplication is impossible); the marketplace is millions of INDEPENDENT rows →
 * no hot row → throughput climbs linearly with concurrency. The chart plots the MEASURED scale curve
 * on Aurora DSQL; the live "Market storm" lever fills the "latest" readout. Never blanks.
 */
interface ScalePanelProps {
  report: MarketStormReport | null;
  busy: boolean;
}

/** MEASURED on Aurora DSQL — independent item trades, distinct rows, zero contention. */
const CURVE: { c: number; tps: number }[] = [
  { c: 10, tps: 42 },
  { c: 25, tps: 103 },
  { c: 50, tps: 204 },
  { c: 100, tps: 383 },
];

const MAX_TPS = 420; // chart ceiling, a touch above the top measured point

export function ScalePanel({ report, busy }: ScalePanelProps) {
  const retriesZero = report == null || report.retriesTotal === 0;

  return (
    <section
      className="duped-panel anim-fade-up"
      style={{ padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div className="kicker" style={{ color: "var(--teal)" }}>
            Scale · million-scale global app
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 6 }}>
            Independent rows scale out linearly
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
            color: "var(--teal)",
            border: "1px solid rgba(47,240,207,0.35)",
            background: "rgba(47,240,207,0.07)",
            borderRadius: 999,
            padding: "6px 12px",
          }}
        >
          <span
            className={busy ? "live-dot" : undefined}
            style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)" }}
          />
          0 CONTENTION
        </div>
      </div>

      {/* the two contrasting ideas */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <ContrastCard
          tone="gold"
          glyph="1"
          eyebrow="One legendary"
          title="Serial by nature"
          body="A single contested item is one hot row. Transfers serialize on it — that's exactly WHY it can never be duplicated."
          tag="correctness under max contention"
        />
        <ContrastCard
          tone="teal"
          glyph="∞"
          eyebrow="The marketplace"
          title="Horizontal scale"
          body="Every player trades their OWN item — a distinct row, no hot row. Throughput climbs with concurrency, near-linearly."
          tag="~2× throughput per 2× concurrency"
        />
      </div>

      {/* the measured scale curve */}
      <div>
        <div
          className="kicker"
          style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>measured scale curve · aurora dsql</span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
          <span style={{ color: "var(--teal)" }}>trades / sec</span>
        </div>
        <ScaleChart latestTps={report?.settlesPerSec ?? null} />
      </div>

      {/* live readout */}
      <div>
        <div
          className="kicker"
          style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>latest market storm</span>
          <span style={{ flex: 1, height: 1, background: "var(--hairline-2)" }} />
          <span style={{ color: retriesZero ? "var(--green)" : "var(--gold)" }}>
            {report == null ? "idle" : retriesZero ? "no contention" : `${report.retriesTotal} retries`}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          <Readout
            big={report ? formatInt(report.settled) : "—"}
            label="Independent trades settled"
            tone="teal"
            sub="distinct rows, committed"
          />
          <Readout
            big={report ? `${Math.round(report.settlesPerSec)}` : "—"}
            label="Throughput"
            tone="teal"
            sub="trades / sec"
            unit="/s"
          />
          <Readout
            big={report ? formatInt(report.retriesTotal) : "—"}
            label="OCC retries"
            tone={retriesZero ? "teal" : "gold"}
            badge={report && retriesZero ? "0 contention" : undefined}
            sub="conflicts on independent rows"
          />
        </div>
      </div>

      {/* captions */}
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text-mid)",
        }}
      >
        Independent rows scale out — <span style={{ color: "var(--text-hi)" }}>~2× throughput per 2× concurrency, 0 contention.</span>{" "}
        A million players trading their own items is a million independent rows, not one.
      </p>
      <p
        style={{
          margin: 0,
          paddingTop: 14,
          borderTop: "1px solid var(--hairline-2)",
          fontFamily: "var(--mono)",
          fontSize: 11.5,
          lineHeight: 1.6,
          color: "var(--text-dim)",
        }}
      >
        One contested item is serial by nature (and stays correct). The economy as a whole scales
        horizontally.
      </p>
    </section>
  );
}

/** The measured bars + a connecting trend line, with an optional live overlay marker. */
function ScaleChart({ latestTps }: { latestTps: number | null }) {
  const W = 560;
  const H = 200;
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = CURVE.length;
  const slot = plotW / n;
  const barW = Math.min(58, slot * 0.46);

  const x = (i: number) => padL + slot * i + slot / 2;
  const y = (tps: number) => padT + plotH * (1 - tps / MAX_TPS);

  const linePts = CURVE.map((d, i) => `${x(i)},${y(d.tps)}`).join(" ");
  const liveY = latestTps != null ? y(Math.min(latestTps, MAX_TPS)) : null;

  return (
    <div
      style={{
        background: "radial-gradient(120% 100% at 0% 0%, rgba(47,240,207,0.06), transparent 65%), var(--panel-2)",
        border: "1px solid var(--hairline)",
        borderRadius: 13,
        padding: "16px 14px 10px",
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Measured throughput versus concurrency on Aurora DSQL" style={{ display: "block" }}>
        <defs>
          <linearGradient id="scaleBar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--teal-deep)" stopOpacity="0.18" />
          </linearGradient>
          <filter id="scaleGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * (1 - g)}
            y2={padT + plotH * (1 - g)}
            stroke="var(--hairline-2)"
            strokeWidth={1}
          />
        ))}

        {/* live throughput marker — where the last storm landed */}
        {liveY != null && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={liveY}
              y2={liveY}
              stroke="var(--gold)"
              strokeWidth={1.2}
              strokeDasharray="3 5"
              opacity={0.7}
            />
            <text
              x={W - padR}
              y={liveY - 6}
              textAnchor="end"
              fontSize={11}
              fontFamily="var(--mono)"
              fill="var(--gold)"
            >
              live {Math.round(latestTps as number)}/s
            </text>
          </g>
        )}

        {/* bars */}
        {CURVE.map((d, i) => {
          const by = y(d.tps);
          return (
            <g key={d.c}>
              <rect
                x={x(i) - barW / 2}
                y={by}
                width={barW}
                height={padT + plotH - by}
                rx={5}
                fill="url(#scaleBar)"
                stroke="var(--teal)"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              {/* value */}
              <text
                x={x(i)}
                y={by - 8}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fontFamily="var(--mono)"
                fill="var(--teal)"
              >
                {d.tps}
              </text>
              {/* concurrency axis label */}
              <text
                x={x(i)}
                y={H - 12}
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--mono)"
                fill="var(--text-dim)"
              >
                {d.c}×
              </text>
            </g>
          );
        })}

        {/* trend line over the bars */}
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
          filter="url(#scaleGlow)"
        />
        {CURVE.map((d, i) => (
          <circle key={d.c} cx={x(i)} cy={y(d.tps)} r={3.2} fill="var(--gold)" stroke="var(--abyss)" strokeWidth={1.4} />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
        }}
      >
        <span>concurrency →</span>
        <span>measured · not simulated</span>
      </div>
    </div>
  );
}

const TONES: Record<string, { color: string; glow: string }> = {
  teal: { color: "var(--teal)", glow: "rgba(47,240,207,0.16)" },
  gold: { color: "var(--gold)", glow: "rgba(255,207,99,0.16)" },
};

function ContrastCard({
  tone,
  glyph,
  eyebrow,
  title,
  body,
  tag,
}: {
  tone: keyof typeof TONES;
  glyph: string;
  eyebrow: string;
  title: string;
  body: string;
  tag: string;
}) {
  const t = TONES[tone];
  return (
    <div
      style={{
        position: "relative",
        background: `radial-gradient(120% 100% at 0% 0%, ${t.glow}, transparent 70%), var(--panel-3)`,
        border: "1px solid var(--hairline)",
        borderRadius: 13,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          className="mono"
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            fontWeight: 700,
            color: t.color,
            background: `${t.glow}`,
            border: `1px solid ${t.color}`,
            boxShadow: `0 0 18px -6px ${t.color}`,
          }}
        >
          {glyph}
        </span>
        <div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
          >
            {eyebrow}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: t.color, marginTop: 3 }}>{title}</div>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-mid)" }}>{body}</p>
      <span
        style={{
          marginTop: "auto",
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: t.color,
          border: `1px solid ${t.color}`,
          opacity: 0.85,
          borderRadius: 5,
          padding: "3px 7px",
          alignSelf: "flex-start",
        }}
      >
        {tag}
      </span>
    </div>
  );
}

function Readout({
  big,
  label,
  tone,
  sub,
  badge,
  unit,
}: {
  big: string;
  label: string;
  tone: keyof typeof TONES;
  sub: string;
  badge?: string;
  unit?: string;
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
      <div className="mono" style={{ fontSize: 32, fontWeight: 600, color: t.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
        {big}
        {unit && big !== "—" && (
          <span style={{ fontSize: 15, color: "var(--text-dim)", marginLeft: 3 }}>{unit}</span>
        )}
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
