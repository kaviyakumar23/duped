"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorld } from "@/components/world/useWorld";
import {
  FALLBACK_SNAPSHOT,
  type RegionCode,
  type StormReport,
  type GoldStormReport,
  type MarketStormReport,
} from "@/components/world/types";
import { WorldArena } from "@/components/world/WorldArena";
import { EconomyConsole } from "@/components/world/EconomyConsole";
import { ScalePanel } from "@/components/world/ScalePanel";
import { RegionHealthPanel } from "@/components/world/RegionHealth";
import { SettlementFeed } from "@/components/world/SettlementFeed";
import { ControlBar } from "@/components/world/ControlBar";
import { ProofModal } from "@/components/world/ProofModal";
import { Toast, type ToastData } from "@/components/world/Toast";
import { formatGold, formatInt } from "@/components/world/format";

/**
 * Duped — THE LIVE WORLD. The root page is the product's face: a single legendary blade that holds
 * at exactly 1 while thousands of bots attack across two regions. Every number traces to the
 * backend (SSE world snapshot + the demo levers), and the SQL proof modal lets a judge verify it
 * live. The page never blanks — it degrades to a contract-shaped fallback if a source is down.
 */
export default function DupedWorld() {
  const { snapshot, conn } = useWorld();
  const world = snapshot ?? FALLBACK_SNAPSHOT;

  const [stormReport, setStormReport] = useState<StormReport | null>(null);
  const [goldReport, setGoldReport] = useState<GoldStormReport | null>(null);
  const [marketReport, setMarketReport] = useState<MarketStormReport | null>(null);
  const [storming, setStorming] = useState(false);
  const [goldStorming, setGoldStorming] = useState(false);
  const [marketStorming, setMarketStorming] = useState(false);
  const [failingOver, setFailingOver] = useState(false);
  const [optimisticRegion, setOptimisticRegion] = useState<RegionCode | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Keep the arena intensified slightly past the request so the deflection burst lands.
  const [arenaStorm, setArenaStorm] = useState(false);
  const [arenaGold, setArenaGold] = useState(false);
  const lingerStorm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerGold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastId = useRef(0);

  const activeRegion: RegionCode = optimisticRegion ?? world.activeRegion;

  const showToast = useCallback((t: Omit<ToastData, "id">) => {
    toastId.current += 1;
    setToast({ ...t, id: toastId.current });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }, []);

  useEffect(
    () => () => {
      if (lingerStorm.current) clearTimeout(lingerStorm.current);
      if (lingerGold.current) clearTimeout(lingerGold.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const runStorm = useCallback(async () => {
    if (storming) return;
    setStorming(true);
    setArenaStorm(true);
    if (lingerStorm.current) clearTimeout(lingerStorm.current);
    try {
      const res = await fetch("/api/world/storm", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as StormReport;
      setStormReport(r);
      showToast({
        tone: "rose",
        title: "⚔ DUPE STORM REPELLED",
        lines: [
          { k: "Dupe attempts blocked", v: formatInt(r.dupeBlocked), good: true },
          { k: "Valid trades settled", v: formatInt(r.settled) },
          { k: "OCC retries", v: formatInt(r.retriesTotal) },
          { k: "Legendaries after", v: formatInt(r.legendaryCountAfter), good: r.legendaryCountAfter === 1 },
        ],
      });
    } catch {
      showToast({
        tone: "rose",
        title: "STORM UNAVAILABLE",
        lines: [{ k: "status", v: "endpoint down", good: false }],
      });
    } finally {
      setStorming(false);
      lingerStorm.current = setTimeout(() => setArenaStorm(false), 1600);
    }
  }, [storming, showToast]);

  const runGoldStorm = useCallback(async () => {
    if (goldStorming) return;
    setGoldStorming(true);
    setArenaGold(true);
    if (lingerGold.current) clearTimeout(lingerGold.current);
    try {
      const res = await fetch("/api/world/gold-storm", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as GoldStormReport;
      setGoldReport(r);
      const conserved = r.goldSupplyBeforeMinor === r.goldSupplyAfterMinor;
      showToast({
        tone: "gold",
        title: "◈ GOLD SUPPLY CONSERVED",
        lines: [
          { k: "Supply before", v: formatGold(r.goldSupplyBeforeMinor) },
          { k: "Supply after", v: formatGold(r.goldSupplyAfterMinor), good: conserved },
          { k: "Transfers settled", v: formatInt(r.transfersSettled) },
          { k: "Declined (insufficient)", v: formatInt(r.declinedInsufficient) },
        ],
      });
    } catch {
      showToast({
        tone: "gold",
        title: "GOLD STORM UNAVAILABLE",
        lines: [{ k: "status", v: "endpoint down", good: false }],
      });
    } finally {
      setGoldStorming(false);
      lingerGold.current = setTimeout(() => setArenaGold(false), 1600);
    }
  }, [goldStorming, showToast]);

  const runMarketStorm = useCallback(async () => {
    if (marketStorming) return;
    setMarketStorming(true);
    setArenaStorm(true);
    if (lingerStorm.current) clearTimeout(lingerStorm.current);
    try {
      const res = await fetch("/api/world/market-storm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts: 1200, concurrency: 100 }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as MarketStormReport;
      setMarketReport(r);
      showToast({
        tone: "teal",
        title: "⇈ MARKET SCALED OUT",
        lines: [
          { k: "Independent trades", v: formatInt(r.settled), good: true },
          { k: "Throughput", v: `${Math.round(r.settlesPerSec)}/s`, good: true },
          { k: "OCC retries", v: formatInt(r.retriesTotal), good: r.retriesTotal === 0 },
          { k: "Concurrency", v: `${r.concurrency}×` },
        ],
      });
    } catch {
      showToast({
        tone: "teal",
        title: "MARKET STORM UNAVAILABLE",
        lines: [{ k: "status", v: "endpoint down", good: false }],
      });
    } finally {
      setMarketStorming(false);
      lingerStorm.current = setTimeout(() => setArenaStorm(false), 1600);
    }
  }, [marketStorming, showToast]);

  const runFailover = useCallback(async () => {
    if (failingOver) return;
    setFailingOver(true);
    try {
      const res = await fetch("/api/world/region", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as { activeRegion: RegionCode };
      setOptimisticRegion(r.activeRegion);
      showToast({
        tone: "violet",
        title: "⇄ REGION FAILED OVER",
        lines: [
          { k: "Now settling on", v: r.activeRegion, good: true },
          { k: "Consistency", v: "preserved", good: true },
        ],
      });
    } catch {
      showToast({
        tone: "violet",
        title: "FAILOVER UNAVAILABLE",
        lines: [{ k: "status", v: "endpoint down", good: false }],
      });
    } finally {
      setFailingOver(false);
    }
  }, [failingOver, showToast]);

  return (
    <main className="duped-shell">
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1440, margin: "0 auto", padding: "0 24px 80px" }}>
        <ControlBar
          activeRegion={activeRegion}
          conn={conn}
          storming={storming}
          goldStorming={goldStorming}
          marketStorming={marketStorming}
          failingOver={failingOver}
          onStorm={runStorm}
          onGoldStorm={runGoldStorm}
          onMarketStorm={runMarketStorm}
          onFailover={runFailover}
          onProof={() => setProofOpen(true)}
        />

        {/* hero strip */}
        <header style={{ marginBottom: 22 }} className="anim-fade-up">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 9,
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "var(--teal)",
              marginBottom: 18,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal)", boxShadow: "0 0 8px var(--teal)" }} className="live-dot" />
            Million-scale global economy
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 5.2vw, 60px)",
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              fontWeight: 700,
              maxWidth: 940,
            }}
          >
            Ten thousand bots attack one legendary.
            <br />
            The count holds at{" "}
            <span
              style={{
                color: "var(--gold)",
                textShadow: "0 0 30px rgba(255,207,99,0.4)",
              }}
            >
              exactly one.
            </span>
          </h1>
          <p
            style={{
              fontSize: "clamp(14px, 1.6vw, 17px)",
              lineHeight: 1.6,
              color: "var(--text-mid)",
              maxWidth: 720,
              margin: "20px 0 0",
            }}
          >
            <span style={{ color: "var(--text-hi)", fontWeight: 600 }}>Duped</span> is a globally
            consistent economy kernel for online games. Duplication is{" "}
            <span style={{ color: "var(--text-hi)" }}>unrepresentable</span> in the authoritative
            state — exclusive ownership rows with version-guarded transfers for unique items,
            conserved balances on a balanced ledger for gold — atomic and strongly consistent across
            regions on <span style={{ color: "var(--teal)" }}>Aurora DSQL</span>, with{" "}
            <span style={{ color: "var(--violet)" }}>DynamoDB</span> powering the live world.
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              marginTop: 18,
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--text-dim)",
            }}
          >
            <span
              className="live-dot"
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--green)",
                boxShadow: "0 0 8px var(--green)",
              }}
            />
            <span>
              <span style={{ color: "var(--text-hi)" }}>{world.realmName}</span> · realm live ·
              settling on{" "}
              <span style={{ color: activeRegion === "SEOUL" ? "var(--violet)" : "var(--teal)" }}>
                {activeRegion}
              </span>
            </span>
          </div>
        </header>

        {/* the arena */}
        <div className="anim-fade-up" style={{ marginBottom: 16 }}>
          <WorldArena
            legendary={world.legendary}
            activeRegion={activeRegion}
            counters={world.counters}
            stormActive={arenaStorm}
            goldStormActive={arenaGold}
            realmName={world.realmName}
          />
        </div>

        {/* console + region (left) · feed (right) */}
        <div className="world-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <EconomyConsole
              invariants={world.invariants}
              counters={world.counters}
              storm={stormReport}
              gold={goldReport}
            />
            <ScalePanel report={marketReport} busy={marketStorming} />
            <RegionHealthPanel
              regions={world.regions}
              activeRegion={activeRegion}
              onFailover={runFailover}
              failingOver={failingOver}
            />
          </div>
          <SettlementFeed feed={world.feed} />
        </div>

        {/* footer */}
        <footer
          style={{
            marginTop: 40,
            paddingTop: 22,
            borderTop: "1px solid var(--hairline-2)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text-dim)",
          }}
        >
          <span>Duped · a globally consistent economy kernel for online games</span>
          <span>Aurora DSQL truth core · DynamoDB read model · {world.realmName}</span>
        </footer>
      </div>

      <ProofModal open={proofOpen} onClose={() => setProofOpen(false)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}
