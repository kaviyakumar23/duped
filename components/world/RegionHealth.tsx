"use client";

import type { RegionHealth, RegionCode } from "./types";
import { formatInt } from "./format";

/**
 * REGION HEALTH — the two peered Aurora DSQL endpoints. The active one is highlighted; the failover
 * button flips which region settles writes and the demo shows trades keep flowing through the
 * survivor (same logical DB → still strongly consistent).
 */
interface RegionPanelProps {
  regions: RegionHealth[];
  activeRegion: RegionCode;
  onFailover: () => void;
  failingOver: boolean;
}

const META: Record<RegionCode, { code: string; color: string; glow: string }> = {
  TOKYO: { code: "ap-northeast-1", color: "var(--teal)", glow: "rgba(47,240,207,0.16)" },
  SEOUL: { code: "ap-northeast-2", color: "var(--violet)", glow: "rgba(157,128,255,0.16)" },
};

export function RegionHealthPanel({ regions, activeRegion, onFailover, failingOver }: RegionPanelProps) {
  const ordered: RegionCode[] = ["TOKYO", "SEOUL"];
  const byRegion = new Map(regions.map((r) => [r.region, r]));

  return (
    <section
      className="duped-panel anim-fade-up"
      style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="kicker" style={{ color: "var(--teal)" }}>
            Region health
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>Active-active · one logical DB</div>
        </div>
        <button
          onClick={onFailover}
          disabled={failingOver}
          style={{
            fontFamily: "var(--sans)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--gold-hot)",
            background: "transparent",
            border: "1px solid rgba(255,207,99,0.4)",
            borderRadius: 9,
            padding: "9px 14px",
            cursor: failingOver ? "default" : "pointer",
            opacity: failingOver ? 0.6 : 1,
            transition: "background 0.2s ease",
            whiteSpace: "nowrap",
          }}
        >
          {failingOver ? "Failing over…" : "⇄ Failover region"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {ordered.map((region) => {
          const r = byRegion.get(region);
          const active = activeRegion === region;
          const m = META[region];
          return (
            <div
              key={region}
              style={{
                position: "relative",
                background: active
                  ? `radial-gradient(120% 100% at 50% 0%, ${m.glow}, transparent 70%), var(--panel-3)`
                  : "var(--panel-2)",
                border: `1px solid ${active ? m.color : "var(--hairline)"}`,
                borderRadius: 13,
                padding: "16px",
                overflow: "hidden",
                transition: "all 0.3s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className={active ? "live-dot" : undefined}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: active ? m.color : "var(--text-faint)",
                    boxShadow: active ? `0 0 10px ${m.color}` : "none",
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.04em" }}>{region}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    letterSpacing: "0.12em",
                    color: active ? m.color : "var(--text-dim)",
                    border: `1px solid ${active ? m.color : "var(--hairline)"}`,
                    borderRadius: 5,
                    padding: "2px 7px",
                  }}
                >
                  {active ? "ACTIVE" : "STANDBY"}
                </span>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--text-dim)", marginTop: 6 }}>
                {m.code}
              </div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 600, color: "var(--text-hi)", marginTop: 14 }}>
                {formatInt(r?.settled ?? 0)}
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                  marginTop: 3,
                }}
              >
                trades settled
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--green)",
          letterSpacing: "0.02em",
          paddingTop: 4,
        }}
      >
        ✓ writes settling on <span style={{ color: "var(--text-hi)" }}>{activeRegion}</span> · commits
        uninterrupted across failover
      </div>
    </section>
  );
}
