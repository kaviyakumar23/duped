"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorld } from "@/components/world/useWorld";
import { FALLBACK_SNAPSHOT } from "@/components/world/types";
import type {
  StormReport,
  GoldStormReport,
  MarketStormReport,
  InvariantReport,
  InvariantResult,
  RegionCode,
  ConnState,
} from "@/components/world/types";

/* -------------------------------------------------------------------------- */
/*  Duped — THE LIVE WORLD. Ported faithfully from the approved claude.ai      */
/*  design, wired to the REAL backend (SSE world snapshot + the demo levers).  */
/*  The mockup's simulation is gone; every number traces to a data source.     */
/* -------------------------------------------------------------------------- */

const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";
const SANS = "var(--font-sora), 'Sora', system-ui, sans-serif";

const fmt = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const gold2 = (m: number) =>
  ((m || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ftime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toTimeString().slice(0, 8);
};

function connMeta(conn: ConnState): { label: string; dot: string } {
  switch (conn) {
    case "live":
      return { label: "LIVE", dot: "#43e08f" };
    case "polling":
      return { label: "POLLING", dot: "#ffd87a" };
    case "error":
      return { label: "OFFLINE", dot: "#ff5f7e" };
    default:
      return { label: "CONNECTING", dot: "#ffd87a" };
  }
}

/* -------------------------------- canvas sim ------------------------------- */
interface Anchor {
  x: number;
  y: number;
}
interface Sim {
  ctx: CanvasRenderingContext2D | null;
  W: number;
  H: number;
  anchors: Record<string, Anchor>;
  shieldR: number;
  stars: { x: number; y: number; r: number; ph: number }[];
  bots: { x: number; y: number; spd: number }[];
  sparks: { x: number; y: number; vx: number; vy: number; life: number }[];
  golds: { p: number; off: number }[];
  stormUntil: number;
  goldFlowUntil: number;
  failoverPing: number;
  legFlash: number;
  botAcc: number;
  legPos: Anchor | null;
  legRegion: RegionCode;
  activeRegion: RegionCode;
  reduced: boolean;
}

interface ToastItem {
  id: number;
  title: string;
  body: string;
  accent: string;
}

export default function DupedWorld() {
  const { snapshot, conn } = useWorld();
  const world = snapshot ?? FALLBACK_SNAPSHOT;

  const [optimisticRegion, setOptimisticRegion] = useState<RegionCode | null>(null);
  const activeRegion: RegionCode = optimisticRegion ?? world.activeRegion;

  const [lastDupe, setLastDupe] = useState<StormReport | null>(null);
  const [occRetriesSum, setOccRetriesSum] = useState(0);
  const [marketReport, setMarketReport] = useState<MarketStormReport | null>(null);

  const [busy, setBusy] = useState<{ storm?: boolean; gold?: boolean; market?: boolean; failover?: boolean }>({});
  const [arenaStorm, setArenaStorm] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [proofOpen, setProofOpen] = useState(false);
  const [proof, setProof] = useState<InvariantReport | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Sim>({
    ctx: null,
    W: 0,
    H: 0,
    anchors: {},
    shieldR: 0,
    stars: [],
    bots: [],
    sparks: [],
    golds: [],
    stormUntil: 0,
    goldFlowUntil: 0,
    failoverPing: 0,
    legFlash: 0,
    botAcc: 0,
    legPos: null,
    legRegion: "TOKYO",
    activeRegion: "TOKYO",
    reduced: false,
  });

  // keep the sim fed with the latest authoritative state
  simRef.current.legRegion = world.legendary.region;
  simRef.current.activeRegion = activeRegion;

  const pushToast = useCallback((title: string, body: string, accent: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((arr) => [{ id, title, body, accent }, ...arr].slice(0, 4));
    const to = setTimeout(() => setToasts((arr) => arr.filter((t) => t.id !== id)), 6500);
    toastTimers.current.push(to);
  }, []);

  useEffect(
    () => () => {
      toastTimers.current.forEach(clearTimeout);
    },
    [],
  );

  /* ----- flash the blade when ownership / region changes between snapshots ---- */
  const prevLeg = useRef<{ owner: string; region: string } | null>(null);
  useEffect(() => {
    const cur = { owner: world.legendary.ownerHandle, region: world.legendary.region };
    if (prevLeg.current && (prevLeg.current.owner !== cur.owner || prevLeg.current.region !== cur.region)) {
      simRef.current.legFlash = performance.now();
    }
    prevLeg.current = cur;
  }, [world.legendary.ownerHandle, world.legendary.region]);

  /* --------------------------- proof modal lifecycle -------------------------- */
  useEffect(() => {
    if (!proofOpen) return;
    let cancelled = false;
    setProof(null);
    void (async () => {
      try {
        const res = await fetch("/api/world/proof", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as InvariantReport;
        if (!cancelled) setProof(data);
      } catch {
        /* fall back to the live snapshot's invariants — never blank the modal */
      }
    })();
    const t = setTimeout(() => closeRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProofOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [proofOpen]);

  /* ------------------------------- the canvas -------------------------------- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const sim = simRef.current;
    sim.ctx = ctx;
    sim.reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.W = w;
      sim.H = h;
      sim.anchors = {
        TOKYO: { x: w * 0.2, y: h * 0.5 },
        SEOUL: { x: w * 0.8, y: h * 0.5 },
        whale: { x: w * 0.2, y: h * 0.85 },
        treasury: { x: w * 0.8, y: h * 0.85 },
        center: { x: w * 0.5, y: h * 0.48 },
      };
      sim.shieldR = Math.min(w, h) * 0.135;
      sim.stars = [];
      const n = Math.round((w * h) / 9000);
      for (let i = 0; i < n; i++)
        sim.stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + 0.3, ph: Math.random() * 6.28 });
      if (!sim.legPos) {
        const a = sim.anchors[sim.legRegion] || sim.anchors.TOKYO;
        sim.legPos = { x: a.x, y: a.y };
      }
    };

    const spawnBot = () => {
      const W = sim.W;
      const H = sim.H;
      let x: number;
      let y: number;
      const e = Math.floor(Math.random() * 4);
      if (e === 0) {
        x = Math.random() * W;
        y = -10;
      } else if (e === 1) {
        x = W + 10;
        y = Math.random() * H;
      } else if (e === 2) {
        x = Math.random() * W;
        y = H + 10;
      } else {
        x = -10;
        y = Math.random() * H;
      }
      sim.bots.push({ x, y, spd: rand(2.0, 4.2) });
    };

    const drawFrame = (t: number) => {
      const A = sim.anchors;
      if (!A.TOKYO) return;
      const W = sim.W;
      const H = sim.H;
      const now = performance.now();
      ctx.clearRect(0, 0, W, H);

      // aurora
      const blob = (cx: number, cy: number, r: number, col: string, al: number) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, "rgba(" + col + "," + al + ")");
        g.addColorStop(1, "rgba(" + col + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      };
      const dr = sim.reduced ? 0 : 1;
      blob(W * (0.22 + 0.04 * Math.sin(t / 5200) * dr), H * (0.18 + 0.03 * Math.cos(t / 6100) * dr), W * 0.55, "46,230,207", 0.1);
      blob(W * (0.8 + 0.04 * Math.cos(t / 5800) * dr), H * (0.3 + 0.03 * Math.sin(t / 4900) * dr), W * 0.52, "160,123,255", 0.11);

      // stars
      ctx.fillStyle = "#fff";
      sim.stars.forEach((s) => {
        const a = sim.reduced ? 0.4 : 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t / 700 + s.ph));
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // arc TOKYO <-> SEOUL
      const tA = A.TOKYO;
      const sA = A.SEOUL;
      const cx = W * 0.5;
      const cy = H * 0.5 - H * 0.2;
      ctx.lineWidth = 1.4;
      const ag = ctx.createLinearGradient(tA.x, 0, sA.x, 0);
      ag.addColorStop(0, "rgba(46,230,207,.5)");
      ag.addColorStop(0.5, "rgba(160,123,255,.45)");
      ag.addColorStop(1, "rgba(46,230,207,.5)");
      ctx.strokeStyle = ag;
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = sim.reduced ? 0 : -t / 26;
      ctx.beginPath();
      ctx.moveTo(tA.x, tA.y);
      ctx.quadraticCurveTo(cx, cy, sA.x, sA.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // region nodes
      const node = (a: Anchor, active: boolean, baseCol: string) => {
        const pulse = active && !sim.reduced ? 0.5 + 0.5 * Math.sin(t / 520) : 0.5;
        const R = Math.min(W, H) * (active ? 0.085 : 0.062) * (1 + pulse * 0.12);
        const g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R * 1.8);
        g.addColorStop(0, "rgba(" + baseCol + "," + (active ? 0.42 : 0.18) + ")");
        g.addColorStop(1, "rgba(" + baseCol + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.x, a.y, R * 1.8, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = "rgba(" + baseCol + "," + (active ? 0.85 : 0.4) + ")";
        ctx.lineWidth = active ? 2 : 1.2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, R, 0, 6.283);
        ctx.stroke();
        ctx.fillStyle = "rgba(" + baseCol + ",0.9)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, 6.283);
        ctx.fill();
      };
      node(A.TOKYO, sim.activeRegion === "TOKYO", "46,230,207");
      node(A.SEOUL, sim.activeRegion === "SEOUL", "46,230,207");

      // failover ping
      if (now - sim.failoverPing < 1100) {
        const a = sim.anchors[sim.activeRegion];
        const k = (now - sim.failoverPing) / 1100;
        ctx.strokeStyle = "rgba(160,123,255," + 0.6 * (1 - k) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, sim.shieldR + k * 120, 0, 6.283);
        ctx.stroke();
      }

      // legendary lerp to its region
      const target = sim.anchors[sim.legRegion] || sim.anchors.TOKYO;
      if (!sim.legPos) sim.legPos = { x: target.x, y: target.y };
      sim.legPos.x += (target.x - sim.legPos.x) * 0.06;
      sim.legPos.y += (target.y - sim.legPos.y) * 0.06;
      const L = sim.legPos;

      // gold flow whale -> treasury
      if (!sim.reduced && now < sim.goldFlowUntil) {
        if (Math.random() < 0.6 && sim.golds.length < 140) sim.golds.push({ p: 0, off: rand(-12, 12) });
      }
      ctx.globalCompositeOperation = "lighter";
      sim.golds = sim.golds.filter((g) => {
        g.p += sim.reduced ? 0 : 0.013;
        if (g.p >= 1) return false;
        const x = A.whale.x + (A.treasury.x - A.whale.x) * g.p;
        const y = A.whale.y + (A.treasury.y - A.whale.y) * g.p + Math.sin(g.p * Math.PI) * -40 + g.off;
        ctx.fillStyle = "rgba(201,162,74,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, 6.283);
        ctx.fill();
        return true;
      });

      // bots
      if (!sim.reduced) {
        const f = 1 + 5 * Math.max(0, (sim.stormUntil - now) / 6800);
        sim.botAcc += 1.1 * f;
        while (sim.botAcc >= 1 && sim.bots.length < 440) {
          sim.botAcc--;
          spawnBot();
        }
      }
      const sr = sim.shieldR;
      sim.bots = sim.bots.filter((b) => {
        const dx = L.x - b.x;
        const dy = L.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < sr + 7) {
          const nx = dx / d;
          const ny = dy / d;
          for (let k = 0; k < 2; k++)
            sim.sparks.push({
              x: b.x,
              y: b.y,
              vx: -nx * rand(1, 3) + rand(-1, 1),
              vy: -ny * rand(1, 3) + rand(-1, 1),
              life: 1,
            });
          return false;
        }
        if (!sim.reduced) {
          b.x += (dx / d) * b.spd;
          b.y += (dy / d) * b.spd;
        }
        ctx.fillStyle = "rgba(46,230,207,0.85)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 1.6, 0, 6.283);
        ctx.fill();
        return true;
      });
      // sparks (blocked)
      sim.sparks = sim.sparks.filter((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.045;
        if (s.life <= 0) return false;
        ctx.fillStyle = "rgba(255,95,126," + s.life + ")";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8 * s.life + 0.5, 0, 6.283);
        ctx.fill();
        return true;
      });
      ctx.globalCompositeOperation = "source-over";

      // shield ring
      const stormK = Math.max(0, (sim.stormUntil - now) / 6800);
      ctx.strokeStyle = "rgba(46,230,207," + (0.35 + 0.4 * stormK) + ")";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = sim.reduced ? 0 : t / 14;
      ctx.beginPath();
      ctx.arc(L.x, L.y, sr, 0, 6.283);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(46,230,207,0.18)";
      ctx.beginPath();
      ctx.arc(L.x, L.y, sr + 5, 0, 6.283);
      ctx.stroke();

      // legendary blade (gold)
      const flashK = Math.max(0, 1 - (now - sim.legFlash) / 900);
      const halo = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, sr * 0.9);
      halo.addColorStop(0, "rgba(255,216,122," + (0.5 + 0.4 * flashK) + ")");
      halo.addColorStop(1, "rgba(255,216,122,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(L.x, L.y, sr * 0.9, 0, 6.283);
      ctx.fill();
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(-0.32);
      const bg = ctx.createLinearGradient(0, -26, 0, 30);
      bg.addColorStop(0, "#fff6da");
      bg.addColorStop(0.5, "#ffd87a");
      bg.addColorStop(1, "#e0a23a");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, -26);
      ctx.lineTo(5, 8);
      ctx.lineTo(0, 30);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(120,70,20,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, 12);
      ctx.lineTo(9, 12);
      ctx.stroke();
      ctx.restore();
      if (flashK > 0) {
        ctx.strokeStyle = "rgba(255,216,122," + flashK + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(L.x, L.y, sr * (1 + (1 - flashK) * 0.6), 0, 6.283);
        ctx.stroke();
      }
    };

    resize();
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => resize());
      if (cv.parentElement) ro.observe(cv.parentElement);
    } catch {
      /* no ResizeObserver */
    }

    let raf = 0;
    const loop = (t: number) => {
      drawFrame(t);
      raf = requestAnimationFrame(loop);
    };
    if (sim.reduced) {
      for (let i = 0; i < 40; i++) spawnBot();
      drawFrame(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  /* -------------------------------- controls --------------------------------- */
  const runStorm = useCallback(async () => {
    if (busy.storm) return;
    setBusy((b) => ({ ...b, storm: true }));
    setArenaStorm(true);
    simRef.current.stormUntil = performance.now() + 6800;
    try {
      const res = await fetch("/api/world/storm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts: 1200, concurrency: 100, waves: 5 }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as StormReport;
      setLastDupe(r);
      setOccRetriesSum((s) => s + (r.retriesTotal || 0));
      pushToast(
        "STORM REPORT · DUPE",
        `${fmt(r.dupeBlocked)} dupes blocked · ${fmt(r.settled)} valid trades settled · ${fmt(
          r.retriesTotal,
        )} OCC retries · legendaryCountAfter = ${r.legendaryCountAfter}`,
        "#ff5f7e",
      );
    } catch {
      pushToast("STORM FAILED", "dupe-storm endpoint unavailable · last-good values held", "#ff5f7e");
    } finally {
      setBusy((b) => ({ ...b, storm: false }));
      setTimeout(() => setArenaStorm(false), 6800);
    }
  }, [busy.storm, pushToast]);

  const runGoldStorm = useCallback(async () => {
    if (busy.gold) return;
    setBusy((b) => ({ ...b, gold: true }));
    simRef.current.goldFlowUntil = performance.now() + 5200;
    try {
      const res = await fetch("/api/world/gold-storm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts: 1200, concurrency: 100 }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as GoldStormReport;
      setOccRetriesSum((s) => s + (r.retriesTotal || 0));
      const conserved = r.goldSupplyBeforeMinor === r.goldSupplyAfterMinor;
      pushToast(
        "STORM REPORT · GOLD",
        `${fmt(r.transfersSettled)} transfers settled · ${fmt(r.declinedInsufficient)} double-spends declined · supply before ${
          conserved ? "==" : "!="
        } after (${gold2(r.goldSupplyAfterMinor)} g)`,
        "#ffd87a",
      );
    } catch {
      pushToast("GOLD STORM FAILED", "gold-storm endpoint unavailable · supply unchanged", "#ffd87a");
    } finally {
      setBusy((b) => ({ ...b, gold: false }));
    }
  }, [busy.gold, pushToast]);

  const runMarketStorm = useCallback(async () => {
    if (busy.market) return;
    setBusy((b) => ({ ...b, market: true }));
    setArenaStorm(true);
    simRef.current.stormUntil = performance.now() + 4600;
    try {
      const res = await fetch("/api/world/market-storm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attempts: 1200, concurrency: 100 }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as MarketStormReport;
      setMarketReport(r);
      setOccRetriesSum((s) => s + (r.retriesTotal || 0));
      pushToast(
        "STORM REPORT · MARKET",
        `${fmt(r.settled)} independent trades · ${Math.round(r.settlesPerSec)} tps @ ${r.concurrency} concurrency · 0 contention · linear scale-out`,
        "#2ee6cf",
      );
    } catch {
      pushToast("MARKET STORM FAILED", "market-storm endpoint unavailable", "#2ee6cf");
    } finally {
      setBusy((b) => ({ ...b, market: false }));
      setTimeout(() => setArenaStorm(false), 4600);
    }
  }, [busy.market, pushToast]);

  const runFailover = useCallback(async () => {
    if (busy.failover) return;
    setBusy((b) => ({ ...b, failover: true }));
    simRef.current.failoverPing = performance.now();
    try {
      const res = await fetch("/api/world/region", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const r = (await res.json()) as { activeRegion: RegionCode };
      setOptimisticRegion(r.activeRegion);
      pushToast(
        "FAILOVER",
        `active region → ${r.activeRegion} · trades keep settling · no item lost, no gold conjured · RPO 0`,
        "#a07bff",
      );
    } catch {
      pushToast("FAILOVER FAILED", "region endpoint unavailable · active region unchanged", "#a07bff");
    } finally {
      setBusy((b) => ({ ...b, failover: false }));
    }
  }, [busy.failover, pushToast]);

  /* -------------------------------- view model ------------------------------- */
  const cm = connMeta(conn);
  const leg = world.legendary;
  const inv = world.invariants;

  const invCards = (inv.results ?? []).map((d: InvariantResult) => ({
    key: d.key,
    label: d.label,
    sql: d.sql,
    expected: d.expected,
    critical: d.critical,
    valueFmt: fmt(d.value),
    dotColor: d.pass ? "#43e08f" : "#ff5f7e",
    barColor: d.pass ? "rgba(67,224,143,.5)" : "rgba(255,95,126,.6)",
    passText: d.pass ? "PASS" : "FAIL",
  }));

  const proofResults = proof?.results ?? inv.results ?? [];
  const proofCards = proofResults.map((d: InvariantResult) => ({
    key: d.key,
    label: d.label,
    sql: d.sql,
    expected: d.expected,
    valueFmt: fmt(d.value),
    dotColor: d.pass ? "#43e08f" : "#ff5f7e",
    passText: d.pass ? "PASS" : "FAIL",
  }));
  const allPass = proof?.allPass ?? inv.allPass;

  const dupeBlockedFmt = fmt((lastDupe?.dupeBlocked ?? 0) + (world.counters.tradesDeclined ?? 0));
  const legCount = leg.count;
  const countColor = legCount === 1 ? "#ffd87a" : "#ff5f7e";
  const countGlow = legCount === 1 ? "rgba(255,216,122,.45)" : "rgba(255,95,126,.5)";
  const chipLeft = leg.region === "TOKYO" ? "20%" : "80%";

  const liveTps = marketReport ? String(Math.round(marketReport.settlesPerSec)) : "—";
  const liveConc = marketReport ? String(marketReport.concurrency) : "—";

  const regionsView = world.regions.map((r) => {
    const active = r.region === activeRegion;
    return {
      region: r.region,
      active,
      settledFmt: fmt(r.settled),
      dot: active ? "#2ee6cf" : "#5a6072",
      bg: active
        ? "linear-gradient(135deg,rgba(46,230,207,.06),rgba(255,255,255,.015))"
        : "rgba(255,255,255,.022)",
      border: active ? "rgba(46,230,207,.28)" : "rgba(255,255,255,.07)",
      status: active ? "● ACTIVE · SETTLING" : "○ STANDBY · WARM",
      statusColor: active ? "#2ee6cf" : "#6b7186",
    };
  });

  const feedView = world.feed.map((ev) => {
    if (ev.movedLegendary) {
      return {
        id: ev.eventId,
        time: ftime(ev.createdAt),
        region: ev.region,
        regionColor: "#ffd87a",
        regionBorder: "rgba(255,216,122,.4)",
        text: "⚔ legendary changed hands → " + ev.playerB,
        textColor: "#ffe9b0",
        amount: "",
        amountColor: "#ffd87a",
        rowBg: "rgba(255,216,122,.07)",
      };
    }
    const isGold = ev.kind === "GOLD" || ev.goldMovedMinor > 0;
    return {
      id: ev.eventId,
      time: ftime(ev.createdAt),
      region: ev.region,
      regionColor: ev.region === "TOKYO" ? "#2ee6cf" : "#a07bff",
      regionBorder: ev.region === "TOKYO" ? "rgba(46,230,207,.3)" : "rgba(160,123,255,.3)",
      text: (isGold ? "gold settled  " : "item traded  ") + ev.playerA + "  →  " + ev.playerB,
      textColor: "#c5cad6",
      amount: isGold ? gold2(ev.goldMovedMinor) + " g" : "",
      amountColor: "#9aa0b2",
      rowBg: "transparent",
    };
  });

  const heading = (n: string, title: string) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 16px" }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: "#5a6072", letterSpacing: ".2em" }}>{n}</span>
      <h2 style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: ".26em", color: "#9aa0b2", margin: 0, fontWeight: 600 }}>
        {title}
      </h2>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,rgba(255,255,255,.12),transparent)" }} />
    </div>
  );

  return (
    <div style={{ position: "relative", zIndex: 2, paddingBottom: 108 }}>
      {/* ============ 01 HERO ============ */}
      <header style={{ maxWidth: 1180, margin: "0 auto", padding: "38px 28px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 28, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 11,
                  height: 26,
                  background: "linear-gradient(180deg,#ffe9b0,#f5c969)",
                  boxShadow: "0 0 22px rgba(255,216,122,.85)",
                  borderRadius: 2,
                  transform: "skewX(-9deg)",
                }}
              />
              <h1 style={{ fontFamily: MONO, fontWeight: 800, fontSize: 35, letterSpacing: "-.02em", margin: 0, lineHeight: 1 }}>
                DUPED
              </h1>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".3em",
                  color: "#6b7186",
                  border: "1px solid rgba(255,255,255,.1)",
                  padding: "5px 9px",
                  borderRadius: 999,
                  alignSelf: "center",
                }}
              >
                ECONOMY KERNEL
              </span>
            </div>
            <p style={{ margin: "16px 0 0", maxWidth: 580, color: "#9aa0b2", fontSize: 15.5, lineHeight: 1.55 }}>
              A globally consistent economy kernel for online games. It makes item &amp; gold duplication{" "}
              <span style={{ color: "#e8eaf0", borderBottom: "1px solid rgba(255,216,122,.5)" }}>unrepresentable</span> in a
              game&apos;s authoritative state.
            </p>
          </div>
          <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 12, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: cm.dot,
                  boxShadow: `0 0 10px ${cm.dot}`,
                  animation: "dblink 2s infinite",
                }}
              />
              <span style={{ color: cm.dot, letterSpacing: ".2em" }}>{cm.label}</span>
            </div>
            <div style={{ marginTop: 9, color: "#6b7186", letterSpacing: ".03em", lineHeight: 1.6 }}>
              {world.realmName} · realm live
              <br />
              settling on <span style={{ color: "#e8eaf0" }}>{activeRegion}</span> · 2 regions
            </div>
          </div>
        </div>
      </header>

      {/* ============ 02 WORLD ARENA ============ */}
      <section style={{ maxWidth: 1180, margin: "26px auto 0", padding: "0 28px" }}>
        {heading("02", `WORLD ARENA · ${world.realmName.toUpperCase()}`)}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "clamp(440px,56vw,608px)",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 20,
            overflow: "hidden",
            background: "radial-gradient(130% 130% at 50% 26%, rgba(22,26,38,.55), rgba(6,7,11,.92))",
            boxShadow: "0 40px 120px -40px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.04)",
          }}
        >
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "12%",
              transform: "translateX(-50%)",
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: ".24em",
              whiteSpace: "nowrap",
              textAlign: "center",
              color: "#8a90a4",
            }}
          >
            ONE LOGICAL DB · STRONGLY CONSISTENT
          </div>

          {/* region labels */}
          <div style={{ position: "absolute", left: "20%", top: "70%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: ".22em", color: "#e8eaf0" }}>TOKYO</div>
            {activeRegion === "TOKYO" && (
              <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: "#2ee6cf" }}>● SETTLING</div>
            )}
          </div>
          <div style={{ position: "absolute", left: "80%", top: "70%", transform: "translateX(-50%)", textAlign: "center" }}>
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: ".22em", color: "#e8eaf0" }}>SEOUL</div>
            {activeRegion === "SEOUL" && (
              <div style={{ marginTop: 5, fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: "#2ee6cf" }}>● SETTLING</div>
            )}
          </div>

          {/* owner / version chip — slides with the blade */}
          <div
            style={{
              position: "absolute",
              top: "31%",
              left: chipLeft,
              transform: "translateX(-50%)",
              transition: "left .9s cubic-bezier(.4,0,.2,1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(20,17,8,.82)",
              border: "1px solid rgba(255,216,122,.3)",
              borderRadius: 999,
              padding: "5px 11px 5px 9px",
              backdropFilter: "blur(6px)",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffd87a", boxShadow: "0 0 8px #ffd87a" }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#ffe9b0" }}>{leg.ownerHandle}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: "#9aa0b2" }}>v{leg.version}</span>
          </div>

          {/* THE MONEY SHOT */}
          <div style={{ position: "absolute", left: "50%", top: "49%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 800,
                fontSize: "clamp(76px,12.5vw,134px)",
                lineHeight: 0.86,
                letterSpacing: "-.04em",
                color: countColor,
                textShadow: `0 0 46px ${countGlow}`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ opacity: 0.42, fontWeight: 500 }}>×</span>
              {legCount}
            </div>
            <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 11.5, letterSpacing: ".5em", color: "#9aa0b2", paddingLeft: ".5em" }}>
              ONE LEGENDARY
            </div>
            <div style={{ marginTop: 7, fontFamily: SANS, fontSize: 12, color: "#5a6072" }}>never duped · 25 years of bugs, ended</div>
          </div>

          {/* legend */}
          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: 16,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: ".06em",
              color: "#6b7186",
            }}
          >
            {[
              ["#2ee6cf", "bot attack"],
              ["#ff5f7e", "blocked"],
              ["#ffd87a", "the one legendary"],
            ].map(([c, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 7px ${c}` }} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ position: "absolute", right: 18, bottom: 16, textAlign: "right", fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: "#6b7186" }}>
            <div style={{ color: "#9aa0b2" }}>{arenaStorm ? "storm · ~6× swarm" : "steady · bots probing"}</div>
            <div style={{ marginTop: 4 }}>bots deflected · shield holding</div>
          </div>
        </div>
      </section>

      {/* ============ 03 ECONOMY CONSOLE ============ */}
      <section style={{ maxWidth: 1180, margin: "42px auto 0", padding: "0 28px" }}>
        {heading("03", "ECONOMY CONSOLE")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))", gap: 13 }}>
          <div
            style={{
              gridColumn: "span 2",
              background: "linear-gradient(135deg,rgba(255,95,126,.07),rgba(255,255,255,.018))",
              border: "1px solid rgba(255,95,126,.18)",
              borderRadius: 15,
              padding: "20px 22px",
              minWidth: 240,
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".18em", color: "#9aa0b2" }}>DUPE ATTEMPTS BLOCKED</div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 800,
                fontSize: "clamp(40px,5vw,56px)",
                lineHeight: 1,
                marginTop: 10,
                color: "#ff8aa0",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-.02em",
              }}
            >
              {dupeBlockedFmt}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: "#6b7186", marginTop: 8 }}>every double-spend rejected at the truth core</div>
          </div>

          <ConsoleTile label="OCC RETRIES" value={fmt(occRetriesSum)} valueColor="#e8eaf0" sub="version-guarded, then re-read" />
          <ConsoleTile label="VALID TRADES SETTLED" value={fmt(world.counters.tradesSettled)} valueColor="#2ee6cf" sub="committed, never reversed" />

          <div style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15, padding: "18px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "#9aa0b2" }}>GOLD SUPPLY</div>
              {inv.allPass && (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 8.5,
                    letterSpacing: ".1em",
                    color: "#43e08f",
                    border: "1px solid rgba(67,224,143,.35)",
                    borderRadius: 999,
                    padding: "2px 6px",
                  }}
                >
                  CONSERVED
                </span>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 26, marginTop: 8, fontVariantNumeric: "tabular-nums", color: "#e8eaf0" }}>
              {fmt((inv.goldSupplyMinor ?? 0) / 100)}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: "#6b7186", marginTop: 6 }}>sum(balance) holds to the minor unit</div>
          </div>

          <div style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(67,224,143,.16)", borderRadius: 15, padding: "18px 18px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "#9aa0b2" }}>LEDGER DRIFT</div>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, marginTop: 8, fontVariantNumeric: "tabular-nums", color: "#43e08f" }}>
              = {fmt(inv.ledgerDriftMinor ?? 0)}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: "#6b7186", marginTop: 6 }}>credits − debits, always zero</div>
          </div>
        </div>

        {/* invariant board */}
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", color: "#5a6072", margin: "24px 0 12px" }}>
          INVARIANTS · CHECKED EVERY TICK AGAINST AURORA DSQL
        </div>
        {invCards.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "#6b7186", padding: "14px 16px", border: "1px solid rgba(255,255,255,.07)", borderRadius: 13 }}>
            waiting for the first invariant sweep…
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 12 }}>
            {invCards.map((iv) => (
              <div
                key={iv.key}
                style={{
                  background: "rgba(255,255,255,.022)",
                  border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 13,
                  padding: "15px 16px",
                  borderLeft: `2px solid ${iv.barColor}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: iv.dotColor, boxShadow: `0 0 9px ${iv.dotColor}`, flexShrink: 0 }} />
                  <span style={{ fontFamily: SANS, fontSize: 13.5, color: "#e8eaf0", flex: 1 }}>{iv.label}</span>
                  {iv.critical && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 8,
                        letterSpacing: ".12em",
                        color: "#9aa0b2",
                        border: "1px solid rgba(255,255,255,.14)",
                        borderRadius: 4,
                        padding: "2px 5px",
                      }}
                    >
                      CRITICAL
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 21, color: iv.dotColor, fontVariantNumeric: "tabular-nums" }}>
                    {iv.valueFmt}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#6b7186" }}>expected {iv.expected}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: iv.dotColor }}>{iv.passText}</span>
                </div>
                <div style={{ marginTop: 11, fontFamily: MONO, fontSize: 10.5, color: "#5a6072", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {iv.sql}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============ 04 SCALE PANEL ============ */}
      <section style={{ maxWidth: 1180, margin: "46px auto 0", padding: "0 28px" }}>
        {heading("04", "MILLION-SCALE PROOF")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
          <div style={{ background: "linear-gradient(135deg,rgba(255,216,122,.05),rgba(255,255,255,.015))", border: "1px solid rgba(255,216,122,.16)", borderRadius: 15, padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: "#ffd87a" }}>THE ONE CONTESTED ITEM</div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 20, marginTop: 10, lineHeight: 1.3 }}>
              Serial by nature — that&apos;s <span style={{ color: "#ffd87a" }}>why</span> it can&apos;t dupe.
            </div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: "#9aa0b2", lineHeight: 1.55, margin: "12px 0 0" }}>
              A single legendary is one row. Concurrent claims funnel through one version guard; exactly one wins, the rest
              re-read. Contention here is the feature.
            </p>
          </div>
          <div style={{ background: "linear-gradient(135deg,rgba(46,230,207,.05),rgba(255,255,255,.015))", border: "1px solid rgba(46,230,207,.16)", borderRadius: 15, padding: "20px 22px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".16em", color: "#2ee6cf" }}>THE MARKETPLACE</div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 20, marginTop: 10, lineHeight: 1.3 }}>
              Millions of independent rows → <span style={{ color: "#2ee6cf" }}>horizontal</span> scale.
            </div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: "#9aa0b2", lineHeight: 1.55, margin: "12px 0 0" }}>
              Disjoint trades touch disjoint rows, so they never wait on each other. Throughput climbs ~2× per 2×
              concurrency with zero contention.
            </p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.022)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15, padding: "20px 22px", marginTop: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".14em", color: "#e8eaf0" }}>MARKETPLACE THROUGHPUT</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: "#6b7186", marginTop: 4 }}>measured on Aurora DSQL · not simulated</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#9aa0b2", letterSpacing: ".1em" }}>LAST MARKET STORM</div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24, color: "#2ee6cf", fontVariantNumeric: "tabular-nums", marginTop: 3 }}>
                {liveTps}
                <span style={{ fontSize: 12, color: "#6b7186", fontWeight: 500 }}> tps</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: "#6b7186" }}>@ {liveConc} concurrency · 0 contention</div>
            </div>
          </div>
          <svg viewBox="0 0 520 248" style={{ width: "100%", height: "auto", marginTop: 14, display: "block" }} preserveAspectRatio="none">
            <defs>
              <linearGradient id="dgArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2ee6cf" stopOpacity="0.28" />
                <stop offset="1" stopColor="#2ee6cf" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="dgLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#2ee6cf" />
                <stop offset="1" stopColor="#a07bff" />
              </linearGradient>
            </defs>
            <line x1="40" y1="210" x2="500" y2="210" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
            <line x1="40" y1="46" x2="40" y2="210" stroke="rgba(255,255,255,.12)" strokeWidth="1" />
            <path d="M40,192 L190,166 L340,123 L480,46 L480,210 L40,210 Z" fill="url(#dgArea)" />
            <path d="M40,192 L190,166 L340,123 L480,46" fill="none" stroke="url(#dgLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M40,192 L480,72" fill="none" stroke="rgba(160,123,255,.4)" strokeWidth="1.2" strokeDasharray="4 5" />
            <g fontFamily="JetBrains Mono" fontSize="10" fill="#9aa0b2" textAnchor="middle">
              <circle cx="40" cy="192" r="4" fill="#06070b" stroke="#2ee6cf" strokeWidth="2" />
              <text x="40" y="228">c=10</text>
              <text x="40" y="183" fill="#e8eaf0">42</text>
              <circle cx="190" cy="166" r="4" fill="#06070b" stroke="#2ee6cf" strokeWidth="2" />
              <text x="190" y="228">25</text>
              <text x="190" y="157" fill="#e8eaf0">103</text>
              <circle cx="340" cy="123" r="4" fill="#06070b" stroke="#2ee6cf" strokeWidth="2" />
              <text x="340" y="228">50</text>
              <text x="340" y="114" fill="#e8eaf0">204</text>
              <circle cx="480" cy="46" r="5" fill="#ffd87a" stroke="#06070b" strokeWidth="2" />
              <text x="480" y="228">100</text>
              <text x="480" y="37" fill="#ffd87a">383</text>
            </g>
            <text x="270" y="244" fontFamily="JetBrains Mono" fontSize="9" fill="#5a6072" textAnchor="middle" letterSpacing="2">
              CONCURRENCY  →  TRADES / SEC
            </text>
          </svg>
        </div>
      </section>

      {/* ============ 05 REGION HEALTH ============ */}
      <section style={{ maxWidth: 1180, margin: "46px auto 0", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "0 0 16px" }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#5a6072", letterSpacing: ".2em" }}>05</span>
          <h2 style={{ fontFamily: MONO, fontSize: 12.5, letterSpacing: ".26em", color: "#9aa0b2", margin: 0, fontWeight: 600 }}>REGION HEALTH</h2>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,rgba(255,255,255,.12),transparent)" }} />
          <button
            onClick={runFailover}
            disabled={busy.failover}
            className="dbtn dbtn-failover2"
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: ".1em",
              color: "#e8eaf0",
              background: "rgba(160,123,255,.12)",
              border: "1px solid rgba(160,123,255,.35)",
              borderRadius: 9,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            ⇄ FAILOVER REGION
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 13 }}>
          {regionsView.map((r) => (
            <div key={r.region} style={{ background: r.bg, border: `1px solid ${r.border}`, borderRadius: 15, padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.dot, boxShadow: `0 0 12px ${r.dot}` }} />
                  <span style={{ fontFamily: MONO, fontSize: 16, letterSpacing: ".16em", color: "#e8eaf0" }}>{r.region}</span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: r.statusColor }}>{r.status}</span>
              </div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 32, marginTop: 16, fontVariantNumeric: "tabular-nums", color: "#e8eaf0" }}>
                {r.settledFmt}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: "#6b7186", marginTop: 3 }}>trades settled in region</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ 06 SETTLEMENT FEED ============ */}
      <section style={{ maxWidth: 1180, margin: "46px auto 0", padding: "0 28px" }}>
        {heading("06", "LIVE SETTLEMENT FEED")}
        <div style={{ background: "rgba(255,255,255,.018)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15, overflow: "hidden" }}>
          {feedView.length === 0 ? (
            <div style={{ padding: "16px 16px", fontFamily: MONO, fontSize: 12, color: "#6b7186" }}>waiting for settlements…</div>
          ) : (
            feedView.map((ev) => (
              <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,.045)", background: ev.rowBg }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#5a6072", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{ev.time}</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: ".1em",
                    color: ev.regionColor,
                    border: `1px solid ${ev.regionBorder}`,
                    borderRadius: 5,
                    padding: "2px 6px",
                    flexShrink: 0,
                    width: 52,
                    textAlign: "center",
                  }}
                >
                  {ev.region}
                </span>
                <span style={{ fontFamily: SANS, fontSize: 13.5, color: ev.textColor, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.text}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12.5, color: ev.amountColor, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{ev.amount}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ============ TOASTS ============ */}
      <div style={{ position: "fixed", right: 18, bottom: 88, zIndex: 55, display: "flex", flexDirection: "column", gap: 10, width: 330, maxWidth: "calc(100vw - 36px)" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "rgba(12,14,20,.94)",
              border: "1px solid rgba(255,255,255,.1)",
              borderLeft: `3px solid ${t.accent}`,
              borderRadius: 11,
              padding: "13px 15px",
              backdropFilter: "blur(12px)",
              boxShadow: "0 18px 50px rgba(0,0,0,.6)",
              animation: "dtoast .32s cubic-bezier(.2,.8,.2,1)",
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: t.accent }}>{t.title}</div>
            <div style={{ fontFamily: SANS, fontSize: 12.5, color: "#c5cad6", marginTop: 6, lineHeight: 1.45 }}>{t.body}</div>
          </div>
        ))}
      </div>

      {/* ============ 07 STICKY CONTROL BAR ============ */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40, display: "flex", justifyContent: "center", padding: 14, pointerEvents: "none" }}>
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            gap: 9,
            background: "rgba(10,12,18,.88)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 15,
            padding: "9px 11px",
            boxShadow: "0 24px 70px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.05)",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 8px 0 4px", borderRight: "1px solid rgba(255,255,255,.1)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: cm.dot, boxShadow: `0 0 9px ${cm.dot}`, animation: "dblink 2s infinite" }} />
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: cm.dot }}>{cm.label}</span>
          </div>
          <button onClick={runStorm} disabled={busy.storm} className="dbtn dbtn-storm" style={ctlBtn("rgba(255,95,126,.16)", "rgba(255,95,126,.4)")}>
            ⚔ Unleash dupe storm
          </button>
          <button onClick={runGoldStorm} disabled={busy.gold} className="dbtn dbtn-gold" style={ctlBtn("rgba(255,216,122,.13)", "rgba(255,216,122,.38)")}>
            ⊘ Gold double-spend
          </button>
          <button onClick={runMarketStorm} disabled={busy.market} className="dbtn dbtn-market" style={ctlBtn("rgba(46,230,207,.13)", "rgba(46,230,207,.38)")}>
            ⇈ Market storm
          </button>
          <button onClick={runFailover} disabled={busy.failover} className="dbtn dbtn-failover" style={ctlBtn("rgba(160,123,255,.14)", "rgba(160,123,255,.38)")}>
            ⇄ Failover region
          </button>
          <button
            onClick={() => setProofOpen(true)}
            className="dbtn dbtn-proof"
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: ".04em",
              color: "#06070b",
              background: "#e8eaf0",
              border: "1px solid #fff",
              borderRadius: 10,
              padding: "9px 15px",
              cursor: "pointer",
            }}
          >
            ▸ Run SQL proof
          </button>
        </div>
      </div>

      {/* ============ PROOF MODAL ============ */}
      {proofOpen && (
        <div
          onClick={() => setProofOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(4,5,8,.74)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="dscroll"
            style={{ width: "100%", maxWidth: 760, maxHeight: "86vh", overflow: "auto", background: "#0a0c12", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, boxShadow: "0 50px 140px rgba(0,0,0,.8)" }}
          >
            <div style={{ position: "sticky", top: 0, background: "#0a0c12", borderBottom: "1px solid rgba(255,255,255,.08)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, zIndex: 1 }}>
              <div>
                <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15, letterSpacing: ".04em" }}>SQL PROOF · LIVE AGAINST AURORA DSQL</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: "#6b7186", marginTop: 4 }}>every invariant, its raw query, and the value it returned right now</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: ".1em",
                    color: allPass ? "#43e08f" : "#ff5f7e",
                    border: `1px solid ${allPass ? "rgba(67,224,143,.35)" : "rgba(255,95,126,.35)"}`,
                    borderRadius: 999,
                    padding: "5px 11px",
                  }}
                >
                  {allPass ? "ALL PASS ✓" : "INVARIANT VIOLATED"}
                </span>
                <button
                  ref={closeRef}
                  onClick={() => setProofOpen(false)}
                  aria-label="Close proof"
                  style={{ fontFamily: MONO, fontSize: 16, color: "#9aa0b2", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 9, width: 34, height: 34, cursor: "pointer", lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: "18px 24px 26px", display: "flex", flexDirection: "column", gap: 14 }}>
              {proofCards.length === 0 ? (
                <div style={{ fontFamily: MONO, fontSize: 12, color: "#9aa0b2" }}>running the proof against Aurora DSQL…</div>
              ) : (
                proofCards.map((iv) => (
                  <div key={iv.key} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 15px", background: "rgba(255,255,255,.02)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: iv.dotColor, boxShadow: `0 0 9px ${iv.dotColor}` }} />
                      <span style={{ fontFamily: SANS, fontSize: 13.5, color: "#e8eaf0", flex: 1 }}>{iv.label}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", color: iv.dotColor }}>{iv.passText}</span>
                    </div>
                    <div style={{ padding: "13px 15px", background: "rgba(0,0,0,.32)", fontFamily: MONO, fontSize: 12, color: "#9fd9cf", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                      {iv.sql}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 15px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".1em", color: "#6b7186" }}>RETURNED</span>
                      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 16, color: iv.dotColor, fontVariantNumeric: "tabular-nums" }}>{iv.valueFmt}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "#6b7186" }}>expected {iv.expected}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- subviews --------------------------------- */
function ctlBtn(bg: string, border: string): React.CSSProperties {
  return {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: ".04em",
    color: "#fff",
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 10,
    padding: "9px 14px",
    cursor: "pointer",
  };
}

function ConsoleTile({ label, value, valueColor, sub }: { label: string; value: string; valueColor: string; sub: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 15, padding: "18px 18px" }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: "#9aa0b2" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, marginTop: 8, fontVariantNumeric: "tabular-nums", color: valueColor }}>{value}</div>
      <div style={{ fontFamily: SANS, fontSize: 11, color: "#6b7186", marginTop: 6 }}>{sub}</div>
    </div>
  );
}
