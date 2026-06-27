"use client";

import type { ConnState, RegionCode } from "./types";

/**
 * CONTROL BAR — sticky. The wordmark, a live/polling indicator, and the four demo levers:
 * unleash a dupe storm, attempt a gold double-spend, fail over the active region, and run the live
 * SQL proof. Busy states are surfaced honestly.
 */
interface ControlBarProps {
  activeRegion: RegionCode;
  conn: ConnState;
  storming: boolean;
  goldStorming: boolean;
  marketStorming: boolean;
  failingOver: boolean;
  onStorm: () => void;
  onGoldStorm: () => void;
  onMarketStorm: () => void;
  onFailover: () => void;
  onProof: () => void;
}

const CONN_META: Record<ConnState, { label: string; color: string }> = {
  connecting: { label: "CONNECTING", color: "var(--text-dim)" },
  live: { label: "LIVE", color: "var(--green)" },
  polling: { label: "POLLING", color: "var(--gold)" },
  error: { label: "OFFLINE", color: "var(--rose)" },
};

export function ControlBar({
  conn,
  storming,
  goldStorming,
  marketStorming,
  failingOver,
  onStorm,
  onGoldStorm,
  onMarketStorm,
  onFailover,
  onProof,
}: ControlBarProps) {
  const c = CONN_META[conn];
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "14px 4px",
        marginBottom: 22,
        background: "linear-gradient(180deg, rgba(6,7,15,0.94), rgba(6,7,15,0.7))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <BladeMark />
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>Duped</span>
        <span
          className="kicker"
          style={{ paddingLeft: 12, borderLeft: "1px solid var(--hairline)" }}
        >
          economy kernel
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            letterSpacing: "0.14em",
            color: c.color,
            border: `1px solid ${c.color}`,
            opacity: 0.95,
            borderRadius: 7,
            padding: "5px 10px",
          }}
        >
          <span
            className={conn === "live" || conn === "polling" ? "live-dot" : undefined}
            style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, boxShadow: `0 0 7px ${c.color}` }}
          />
          {c.label}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <Btn onClick={onStorm} busy={storming} tone="rose" icon="⚔">
          {storming ? "Storming…" : "Unleash dupe storm"}
        </Btn>
        <Btn onClick={onGoldStorm} busy={goldStorming} tone="gold" icon="◈">
          {goldStorming ? "Spending…" : "Gold double-spend"}
        </Btn>
        <Btn onClick={onMarketStorm} busy={marketStorming} tone="scale" icon="⇈">
          {marketStorming ? "Scaling…" : "Market storm"}
        </Btn>
        <Btn onClick={onFailover} busy={failingOver} tone="violet" icon="⇄">
          {failingOver ? "Failing over…" : "Failover region"}
        </Btn>
        <Btn onClick={onProof} tone="teal" icon="∑">
          Run SQL proof
        </Btn>
      </div>
    </div>
  );
}

const BTN_TONE: Record<string, { fg: string; border: string; bg: string }> = {
  rose: { fg: "#0b0610", border: "var(--rose)", bg: "var(--rose)" },
  gold: { fg: "#170f02", border: "var(--gold)", bg: "var(--gold)" },
  scale: { fg: "#03130f", border: "var(--teal)", bg: "var(--teal)" },
  violet: { fg: "var(--violet)", border: "rgba(157,128,255,0.45)", bg: "transparent" },
  teal: { fg: "var(--teal)", border: "rgba(47,240,207,0.45)", bg: "transparent" },
};

function Btn({
  children,
  onClick,
  busy,
  tone,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone: keyof typeof BTN_TONE;
  icon: string;
}) {
  const t = BTN_TONE[tone];
  const solid = tone === "rose" || tone === "gold" || tone === "scale";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--sans)",
        fontSize: 13,
        fontWeight: 600,
        color: t.fg,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 9,
        padding: "9px 15px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.65 : 1,
        boxShadow: solid ? `0 0 22px -4px ${t.bg}` : "none",
        transition: "transform 0.12s ease, box-shadow 0.2s ease",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {children}
    </button>
  );
}

function BladeMark() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden style={{ filter: "drop-shadow(0 0 6px rgba(255,207,99,0.6))" }}>
      <path d="M8 1 L11 10 L9.5 12 L6.5 12 L5 10 Z" fill="#ffcf63" />
      <rect x="3" y="12" width="10" height="2" rx="1" fill="#9d80ff" />
      <rect x="7" y="14" width="2" height="3" fill="#9d80ff" />
    </svg>
  );
}
