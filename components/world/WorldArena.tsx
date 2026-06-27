"use client";

import { useEffect, useRef, useState } from "react";
import type { LegendaryState, RegionCode, WorldCounters } from "./types";
import { formatInt } from "./format";

/**
 * THE WORLD ARENA — the cinematic centerpiece.
 *
 * Two region clusters (TOKYO / SEOUL) glow as nodes joined by a consistency arc. A SINGLE luminous
 * legendary blade lives at its current owner's region and slides across when the snapshot's
 * region/owner changes — and is only EVER drawn in one place. A live swarm of "bot" dots streams
 * toward the blade and DEFLECTS off a shield (blocked); the swarm intensifies during a dupe storm.
 * During a gold storm, gold particles flow whale → treasury (supply conserved). A calm "× 1"
 * readout, bound to legendary.count, is the emotional core: thousands attack — still one.
 *
 * Structure = crisp SVG. Live swarm = a single <canvas> particle system. The blade + readouts =
 * an HTML overlay so we get real CSS glow. All three layers share one fractional coordinate space.
 */

/** Fractional anchor points (0..1) shared by SVG, canvas, and the HTML overlay. */
const PT = {
  TOKYO: { fx: 0.27, fy: 0.46 },
  SEOUL: { fx: 0.73, fy: 0.46 },
  WHALE: { fx: 0.14, fy: 0.85 },
  TREASURY: { fx: 0.86, fy: 0.85 },
} as const;

const VB_W = 1000;
const VB_H = 480;
const sx = (fx: number) => fx * VB_W;
const sy = (fy: number) => fy * VB_H;

type BotState = "in" | "out";
interface Bot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  st: BotState;
  life: number;
  r: number;
  hue: number; // 0 teal incoming, 1 rose deflected
}
interface GoldP {
  p: number;
  speed: number;
  off: number;
  r: number;
}

function quad(p0: number, c: number, p1: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * p0 + 2 * mt * t * c + t * t * p1;
}

interface ArenaProps {
  legendary: LegendaryState;
  activeRegion: RegionCode;
  counters: WorldCounters;
  stormActive: boolean;
  goldStormActive: boolean;
  realmName: string;
}

export function WorldArena({
  legendary,
  activeRegion,
  counters,
  stormActive,
  goldStormActive,
  realmName,
}: ArenaProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Latest values the rAF loop reads without re-subscribing.
  const targetRef = useRef(legendary.region === "SEOUL" ? PT.SEOUL : PT.TOKYO);
  const stormRef = useRef(stormActive);
  const goldRef = useRef(goldStormActive);

  useEffect(() => {
    targetRef.current = legendary.region === "SEOUL" ? PT.SEOUL : PT.TOKYO;
  }, [legendary.region]);
  useEffect(() => {
    stormRef.current = stormActive;
  }, [stormActive]);
  useEffect(() => {
    goldRef.current = goldStormActive;
  }, [goldStormActive]);

  // Transient "changed hands" flash, keyed off owner/region/version.
  const [flash, setFlash] = useState<string | null>(null);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    setFlash(`${legendary.ownerHandle} · ${legendary.region}`);
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [legendary.ownerHandle, legendary.region, legendary.version]);

  // -------------------------------- particle loop --------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = wrap.clientWidth;
      cssH = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const bots: Bot[] = [];
    const golds: GoldP[] = [];
    let botAcc = 0;
    let goldAcc = 0;
    let shield = 0;
    let raf = 0;
    let last = performance.now();

    const spawnBot = (tx: number, ty: number, storm: boolean) => {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.max(cssW, cssH) * (0.42 + Math.random() * 0.3);
      const x = tx + Math.cos(ang) * rad;
      const y = ty + Math.sin(ang) * rad;
      const sp = (storm ? 240 : 150) + Math.random() * 130;
      const dx = tx - x;
      const dy = ty - y;
      const d = Math.hypot(dx, dy) || 1;
      bots.push({
        x,
        y,
        vx: (dx / d) * sp,
        vy: (dy / d) * sp,
        st: "in",
        life: 4,
        r: 1 + Math.random() * 1.5,
        hue: 0,
      });
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, cssW, cssH);
      if (cssW === 0 || cssH === 0) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const t = targetRef.current;
      const tx = t.fx * cssW;
      const ty = t.fy * cssH;
      const storm = stormRef.current;
      const goldStorm = goldRef.current;
      const shieldR = Math.max(30, Math.min(cssW, cssH) * 0.11);

      // ---- spawn swarm ----
      const cap = storm ? 540 : 150;
      const rate = storm ? 9 : 1.7;
      botAcc += rate;
      while (botAcc >= 1) {
        botAcc -= 1;
        if (bots.length < cap) spawnBot(tx, ty, storm);
      }

      ctx.globalCompositeOperation = "lighter";

      // ---- update + draw swarm ----
      for (let i = bots.length - 1; i >= 0; i--) {
        const b = bots[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;

        if (b.st === "in") {
          const d = Math.hypot(tx - b.x, ty - b.y);
          if (d < shieldR) {
            // DEFLECT — this attack is blocked by the version-guarded shield.
            const nx = (b.x - tx) / (d || 1);
            const ny = (b.y - ty) / (d || 1);
            const sp = Math.hypot(b.vx, b.vy) * 1.04;
            const dir = Math.random() < 0.5 ? 1 : -1;
            const tnx = -ny * dir;
            const tny = nx * dir;
            b.vx = (nx * 0.72 + tnx * 0.72) * sp;
            b.vy = (ny * 0.72 + tny * 0.72) * sp;
            b.st = "out";
            b.life = 0.9;
            b.hue = 1;
            shield = Math.min(1.5, shield + (storm ? 0.05 : 0.12));
          }
        } else {
          b.vx *= 0.99;
          b.vy *= 0.99;
        }

        const out =
          b.life <= 0 ||
          (b.st === "out" &&
            (b.x < -80 || b.x > cssW + 80 || b.y < -80 || b.y > cssH + 80));
        if (out) {
          bots.splice(i, 1);
          continue;
        }

        // draw: short trail + glowing core
        const fade = b.st === "in" ? 0.85 : Math.max(0, b.life / 0.9);
        const col =
          b.hue === 0
            ? `rgba(47,240,207,${0.22 * fade})`
            : `rgba(255,93,124,${0.5 * fade})`;
        const core =
          b.hue === 0
            ? `rgba(150,255,238,${0.85 * fade})`
            : `rgba(255,170,190,${0.95 * fade})`;
        ctx.strokeStyle = col;
        ctx.lineWidth = b.r;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- shield ring around the blade ----
      shield = Math.max(0, shield - dt * 1.8);
      const baseA = (storm ? 0.2 : 0.09) + shield * 0.5;
      ctx.strokeStyle = `rgba(47,240,207,${baseA})`;
      ctx.lineWidth = 1.5 + shield * 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, shieldR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,207,99,${0.05 + shield * 0.32})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx, ty, shieldR * 0.64, 0, Math.PI * 2);
      ctx.stroke();

      // ---- gold flow (conserved): whale → treasury ----
      if (goldStorm) {
        goldAcc += 4;
        while (goldAcc >= 1) {
          goldAcc -= 1;
          if (golds.length < 280)
            golds.push({
              p: 0,
              speed: 0.5 + Math.random() * 0.5,
              off: (Math.random() - 0.5) * 18,
              r: 1 + Math.random() * 1.4,
            });
        }
      }
      const wx = PT.WHALE.fx * cssW;
      const wy = PT.WHALE.fy * cssH;
      const trx = PT.TREASURY.fx * cssW;
      const tryy = PT.TREASURY.fy * cssH;
      const cxg = (wx + trx) / 2;
      const cyg = Math.min(wy, tryy) - cssH * 0.16;
      for (let i = golds.length - 1; i >= 0; i--) {
        const g = golds[i];
        g.p += dt * g.speed;
        if (g.p >= 1) {
          golds.splice(i, 1);
          continue;
        }
        const x = quad(wx, cxg, trx, g.p);
        const y = quad(wy, cyg, tryy, g.p) + g.off * Math.sin(g.p * Math.PI);
        const a = Math.sin(g.p * Math.PI);
        ctx.fillStyle = `rgba(255,207,99,${0.9 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, g.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,231,168,${0.5 * a})`;
        ctx.beginPath();
        ctx.arc(x, y, g.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    if (reduce) {
      // Honor reduced motion: render one static frame and stop.
      frame(performance.now());
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const count = legendary.count;
  const oneOk = count === 1;
  const bladeAtSeoul = legendary.region === "SEOUL";
  const bladeLeft = `${(bladeAtSeoul ? PT.SEOUL.fx : PT.TOKYO.fx) * 100}%`;
  const bladeTop = `${PT.TOKYO.fy * 100}%`;

  const goldDim = goldStormActive ? 1 : 0.32;

  return (
    <div
      ref={wrapRef}
      className="duped-panel"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${VB_W} / ${VB_H}`,
        minHeight: 430,
        maxHeight: 660,
        overflow: "hidden",
        background:
          "radial-gradient(70% 60% at 50% 38%, rgba(47,240,207,0.05), transparent 60%), linear-gradient(180deg,#070a16,#05060f)",
        animation: stormActive ? "duped-shake 0.5s ease-in-out infinite" : undefined,
      }}
    >
      {/* ---- structure (crisp SVG) ---- */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
        aria-hidden
      >
        <defs>
          <radialGradient id="tealNode" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#9af7e8" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#2ff0cf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2ff0cf" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="violetNode" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c9b8ff" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#9d80ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#9d80ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2ff0cf" stopOpacity="0.65" />
            <stop offset="50%" stopColor="#9d80ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2ff0cf" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        {/* faint world grid */}
        <g stroke="rgba(126,158,222,0.05)" strokeWidth="1">
          {Array.from({ length: 9 }, (_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 100} y1="0" x2={(i + 1) * 100} y2={VB_H} />
          ))}
          {Array.from({ length: 4 }, (_, i) => (
            <line key={`h${i}`} x1="0" y1={(i + 1) * 96} x2={VB_W} y2={(i + 1) * 96} />
          ))}
        </g>

        {/* consistency arc between regions */}
        <path
          d={`M ${sx(PT.TOKYO.fx)} ${sy(PT.TOKYO.fy)} Q 500 ${sy(PT.TOKYO.fy) - 150} ${sx(
            PT.SEOUL.fx,
          )} ${sy(PT.SEOUL.fy)}`}
          fill="none"
          stroke="url(#arcGrad)"
          strokeWidth="1.5"
          strokeDasharray="3 10"
          style={{ animation: "duped-dash 8s linear infinite" }}
        />
        <text
          x="500"
          y={sy(PT.TOKYO.fy) - 150}
          textAnchor="middle"
          fill="#545f80"
          style={{ fontFamily: "var(--mono)", fontSize: 12, letterSpacing: "0.16em" }}
        >
          ONE LOGICAL DB · STRONGLY CONSISTENT
        </text>

        {/* gold channel whale → treasury */}
        <path
          d={`M ${sx(PT.WHALE.fx)} ${sy(PT.WHALE.fy)} Q 500 ${sy(PT.WHALE.fy) - 80} ${sx(
            PT.TREASURY.fx,
          )} ${sy(PT.TREASURY.fy)}`}
          fill="none"
          stroke="rgba(255,207,99,0.4)"
          strokeWidth="1"
          strokeDasharray="2 8"
          style={{ opacity: goldDim, transition: "opacity 0.5s ease" }}
        />

        {/* region nodes */}
        <RegionGlyph
          x={sx(PT.TOKYO.fx)}
          y={sy(PT.TOKYO.fy)}
          fill="url(#tealNode)"
          ring="#2ff0cf"
          active={activeRegion === "TOKYO"}
        />
        <RegionGlyph
          x={sx(PT.SEOUL.fx)}
          y={sy(PT.SEOUL.fy)}
          fill="url(#violetNode)"
          ring="#9d80ff"
          active={activeRegion === "SEOUL"}
        />

        {/* region labels */}
        <RegionLabel
          x={sx(PT.TOKYO.fx)}
          y={sy(PT.TOKYO.fy)}
          name="TOKYO"
          code="ap-northeast-1"
          settled={counters.settledTokyo}
          active={activeRegion === "TOKYO"}
          color="#2ff0cf"
        />
        <RegionLabel
          x={sx(PT.SEOUL.fx)}
          y={sy(PT.SEOUL.fy)}
          name="SEOUL"
          code="ap-northeast-2"
          settled={counters.settledSeoul}
          active={activeRegion === "SEOUL"}
          color="#9d80ff"
        />

        {/* whale + treasury markers */}
        <GoldNode x={sx(PT.WHALE.fx)} y={sy(PT.WHALE.fy)} label="WHALE" sub="GoldBaron" dim={goldDim} />
        <GoldNode
          x={sx(PT.TREASURY.fx)}
          y={sy(PT.TREASURY.fy)}
          label="TREASURY"
          sub="Realm_Treasury"
          dim={goldDim}
        />
      </svg>

      {/* ---- live swarm (single canvas) ---- */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
        aria-hidden
      />

      {/* ---- HTML overlay: the ONE blade, the calm count, owner ---- */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
        {/* calm emotional core — bound to legendary.count */}
        <div
          style={{
            position: "absolute",
            top: "27%",
            left: 0,
            right: 0,
            textAlign: "center",
          }}
        >
          <div className="kicker" style={{ color: "var(--text-dim)" }}>
            authoritative state · count(*) where legendary
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              marginTop: 6,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: "clamp(28px, 5vw, 58px)",
                fontWeight: 300,
                color: oneOk ? "var(--gold)" : "var(--rose)",
                opacity: 0.7,
                lineHeight: 1,
              }}
            >
              ×
            </span>
            <span
              className="mono"
              style={{
                fontSize: "clamp(64px, 12vw, 150px)",
                fontWeight: 600,
                color: oneOk ? "var(--gold)" : "var(--rose)",
                lineHeight: 0.85,
                animation: oneOk ? "duped-count-glow 4s ease-in-out infinite" : undefined,
              }}
            >
              {count}
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: "clamp(10px, 1.3vw, 13px)",
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: oneOk ? "var(--gold-hot)" : "var(--rose)",
              marginTop: 10,
            }}
          >
            {oneOk ? "One Legendary" : "Invariant breach"}
          </div>
          <div
            style={{
              fontSize: "clamp(11px, 1.4vw, 14px)",
              color: "var(--text-mid)",
              marginTop: 8,
              maxWidth: 460,
              marginInline: "auto",
              padding: "0 16px",
            }}
          >
            {stormActive ? (
              <>
                <span style={{ color: "var(--rose)" }}>{formatInt(counters.tradesDeclined)}</span>{" "}
                attacks deflected — still exactly one.
              </>
            ) : (
              <>
                The only one in <span style={{ color: "var(--text-hi)" }}>{realmName}</span> · held by{" "}
                <span style={{ color: "var(--gold)" }}>{legendary.ownerHandle}</span>
              </>
            )}
          </div>
        </div>

        {/* the ONE blade — slides between region nodes; rendered exactly once */}
        <div
          style={{
            position: "absolute",
            left: bladeLeft,
            top: bladeTop,
            transform: "translate(-50%, -50%)",
            transition: "left 1.15s cubic-bezier(0.7,0,0.2,1), top 1.15s cubic-bezier(0.7,0,0.2,1)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <BladeIcon />
          <div
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(8,10,20,0.72)",
              border: "1px solid rgba(255,207,99,0.3)",
              backdropFilter: "blur(6px)",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--gold)",
                boxShadow: "var(--glow-gold)",
              }}
              className="live-dot"
            />
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--gold-hot)", letterSpacing: "0.02em" }}
            >
              {legendary.ownerHandle}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-dim)" }}>
              v{legendary.version}
            </span>
          </div>
        </div>

        {/* "changed hands" flash */}
        {flash && (
          <div
            key={flash}
            style={{
              position: "absolute",
              bottom: "16%",
              left: 0,
              right: 0,
              textAlign: "center",
              animation: "duped-flash 2.6s ease both",
            }}
          >
            <span
              className="mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: "var(--gold-hot)",
                background: "rgba(255,207,99,0.1)",
                border: "1px solid rgba(255,207,99,0.35)",
                borderRadius: 999,
                padding: "7px 16px",
                backdropFilter: "blur(6px)",
              }}
            >
              ⚔ legendary changed hands → {flash}
            </span>
          </div>
        )}
      </div>

      {/* corner HUD */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 16,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        <span className="kicker">REALM</span>
        <span
          className="mono"
          style={{ fontSize: 12, color: "var(--text-hi)", letterSpacing: "0.04em" }}
        >
          {realmName}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 16,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 7,
          pointerEvents: "none",
        }}
      >
        <span
          className="live-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: activeRegion === "SEOUL" ? "var(--violet)" : "var(--teal)",
            boxShadow:
              activeRegion === "SEOUL"
                ? "0 0 12px var(--violet)"
                : "0 0 12px var(--teal)",
          }}
        />
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--text-mid)", letterSpacing: "0.06em" }}
        >
          settling on {activeRegion}
        </span>
      </div>

      {/* legend */}
      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 16,
          zIndex: 3,
          display: "flex",
          gap: 16,
          fontFamily: "var(--mono)",
          fontSize: 10,
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
          pointerEvents: "none",
        }}
      >
        <LegendDot color="#2ff0cf" label="attack" />
        <LegendDot color="#ff5d7c" label="deflected" />
        <LegendDot color="#ffcf63" label="gold flow" />
      </div>
    </div>
  );
}

function RegionGlyph({
  x,
  y,
  fill,
  ring,
  active,
}: {
  x: number;
  y: number;
  fill: string;
  ring: string;
  active: boolean;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r={64} fill={fill} opacity={active ? 0.95 : 0.5} />
      {active && (
        <circle
          cx={x}
          cy={y}
          r={30}
          fill="none"
          stroke={ring}
          strokeWidth={1.4}
          opacity={0.8}
          style={{ transformOrigin: `${x}px ${y}px`, animation: "duped-ping 2.6s ease-out infinite" }}
        />
      )}
      <circle cx={x} cy={y} r={26} fill="none" stroke={ring} strokeWidth={1.2} opacity={active ? 0.85 : 0.4} />
      <circle cx={x} cy={y} r={5} fill={ring} opacity={active ? 1 : 0.6} />
    </g>
  );
}

function RegionLabel({
  x,
  y,
  name,
  code,
  settled,
  active,
  color,
}: {
  x: number;
  y: number;
  name: string;
  code: string;
  settled: number;
  active: boolean;
  color: string;
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <text
        x={x}
        y={y + 58}
        textAnchor="middle"
        fill={active ? color : "#8d9bc2"}
        style={{ fontFamily: "var(--mono)", fontSize: 17, letterSpacing: "0.18em", fontWeight: 600 }}
      >
        {name}
      </text>
      <text
        x={x}
        y={y + 76}
        textAnchor="middle"
        fill="#545f80"
        style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.08em" }}
      >
        {code} · {formatInt(settled)} settled
      </text>
      {active && (
        <text
          x={x}
          y={y + 93}
          textAnchor="middle"
          fill={color}
          style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.22em" }}
        >
          ● ACTIVE
        </text>
      )}
    </g>
  );
}

function GoldNode({
  x,
  y,
  label,
  sub,
  dim,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  dim: number;
}) {
  return (
    <g style={{ opacity: 0.35 + dim * 0.65, transition: "opacity 0.5s ease", pointerEvents: "none" }}>
      <circle cx={x} cy={y} r={16} fill="none" stroke="#ffcf63" strokeWidth={1} opacity={0.7} />
      <circle cx={x} cy={y} r={3} fill="#ffcf63" />
      <text
        x={x}
        y={y - 24}
        textAnchor="middle"
        fill="#ffcf63"
        style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em" }}
      >
        {label}
      </text>
      <text
        x={x}
        y={y + 30}
        textAnchor="middle"
        fill="#545f80"
        style={{ fontFamily: "var(--mono)", fontSize: 9.5 }}
      >
        {sub}
      </text>
    </g>
  );
}

function BladeIcon() {
  return (
    <svg
      width="46"
      height="132"
      viewBox="0 0 46 132"
      style={{
        filter: "drop-shadow(0 0 10px rgba(255,207,99,0.7)) drop-shadow(0 0 26px rgba(255,207,99,0.35))",
        animation: "duped-bob 3.4s ease-in-out infinite",
        transformOrigin: "center",
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="bladeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e9a32c" />
          <stop offset="45%" stopColor="#fff4d6" />
          <stop offset="55%" stopColor="#fff4d6" />
          <stop offset="100%" stopColor="#e9a32c" />
        </linearGradient>
        <linearGradient id="gripGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a5cf0" />
          <stop offset="50%" stopColor="#c9b8ff" />
          <stop offset="100%" stopColor="#7a5cf0" />
        </linearGradient>
      </defs>
      {/* blade */}
      <path
        d="M23 4 L31 70 L27 84 L19 84 L15 70 Z"
        fill="url(#bladeGrad)"
        stroke="#fff7e0"
        strokeWidth="0.6"
      />
      {/* fuller highlight */}
      <line x1="23" y1="12" x2="23" y2="78" stroke="#fffaf0" strokeWidth="1" opacity="0.8" />
      {/* guard */}
      <rect x="6" y="84" width="34" height="7" rx="3" fill="url(#gripGrad)" />
      {/* grip */}
      <rect x="19" y="91" width="8" height="28" rx="3" fill="#9d80ff" />
      {/* pommel */}
      <circle cx="23" cy="123" r="5" fill="#c9b8ff" stroke="#7a5cf0" strokeWidth="0.8" />
    </svg>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }}
      />
      {label}
    </span>
  );
}
