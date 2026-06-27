"use client";

import type { FeedEvent } from "./types";
import { formatGold, clockTime, handleLabel } from "./format";

/**
 * LIVE SETTLEMENT FEED — the DynamoDB world read model, newest first. Each row shows the kind,
 * region, the two parties, and any gold that moved. Rows where the legendary changed hands are
 * highlighted in gold — the rare, real ownership transfer amid thousands of blocked attempts.
 */
export function SettlementFeed({ feed }: { feed: FeedEvent[] }) {
  return (
    <section
      className="duped-panel anim-fade-up"
      style={{ padding: "22px", display: "flex", flexDirection: "column", minHeight: 420 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div className="kicker" style={{ color: "var(--teal)" }}>
          Live settlement feed
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)" }}>
          <span
            className="live-dot"
            style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", boxShadow: "0 0 7px var(--green)" }}
          />
          streaming
        </span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)", letterSpacing: "0.04em", marginBottom: 12 }}>
        DynamoDB read model · newest first
      </div>

      <div className="duped-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", maxHeight: 520 }}>
        {feed.length === 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: 200,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
              lineHeight: 1.8,
            }}
          >
            awaiting settlements…
            <br />
            unleash a storm to begin
          </div>
        ) : (
          feed.map((e, i) => <FeedRow key={e.eventId || i} e={e} />)
        )}
      </div>
    </section>
  );
}

function FeedRow({ e }: { e: FeedEvent }) {
  const legendary = e.movedLegendary;
  const hasGold = e.goldMovedMinor > 0;
  const regionColor = e.region === "SEOUL" ? "var(--violet)" : "var(--teal)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "11px 10px",
        marginBottom: 2,
        borderRadius: 9,
        border: legendary ? "1px solid rgba(255,207,99,0.4)" : "1px solid transparent",
        background: legendary ? "rgba(255,207,99,0.07)" : "transparent",
        borderBottom: legendary ? "1px solid rgba(255,207,99,0.4)" : "1px solid var(--hairline-2)",
        animation: "duped-feed-in 0.55s ease both",
      }}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
        {clockTime(e.createdAt)}
      </span>

      <div style={{ minWidth: 0 }}>
        {legendary ? (
          <div style={{ fontSize: 12.5, color: "var(--gold-hot)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚔</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              legendary changed hands → <span style={{ color: "var(--gold)", fontWeight: 600 }}>{handleLabel(e.playerB)}</span>
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 8.5,
                letterSpacing: "0.1em",
                color: "var(--text-mid)",
                border: "1px solid var(--hairline)",
                borderRadius: 4,
                padding: "2px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {e.kind || "TRADE"}
            </span>
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--text-mid)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {handleLabel(e.playerA)} <span style={{ color: "var(--text-faint)" }}>→</span> {handleLabel(e.playerB)}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 8.5,
            letterSpacing: "0.08em",
            color: regionColor,
            border: `1px solid ${regionColor}`,
            opacity: 0.85,
            borderRadius: 4,
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}
        >
          {e.region}
        </span>
        {hasGold && (
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gold)", whiteSpace: "nowrap" }}>
            {formatGold(e.goldMovedMinor)}
          </span>
        )}
      </div>
    </div>
  );
}
