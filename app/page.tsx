"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Duped — the marketing front door. A judge should grasp WHAT this is and    */
/*  WHY it matters in ~10 seconds, then want to try it. Deep cinematic aurora  */
/*  theme; the void background lives on <body>, so every section is            */
/*  transparent. Inline styles + CSS vars, the house style.                    */
/* -------------------------------------------------------------------------- */

const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";
const SANS = "var(--font-sora), 'Sora', system-ui, sans-serif";

const C = {
  text: "#e8eaf0",
  muted: "#9aa0b2",
  dim: "#6b7186",
  dimmer: "#5a6072",
  teal: "#2ee6cf",
  violet: "#a07bff",
  gold: "#ffd87a",
  rose: "#ff5f7e",
  green: "#43e08f",
};

const panel: React.CSSProperties = {
  background: "rgba(255,255,255,.022)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 18,
};

const sectionWrap: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "0 28px",
};

/* ------------------------------ section header ----------------------------- */
function SectionHeader({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 34 }}>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 12,
          fontWeight: 700,
          color: C.teal,
          letterSpacing: ".05em",
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: ".34em",
          color: C.muted,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <span
        style={{
          flex: 1,
          height: 1,
          background: "linear-gradient(90deg, rgba(255,255,255,.13), transparent)",
        }}
      />
    </div>
  );
}

/* -------------------------------- hero motif ------------------------------- */
function HeroMotif() {
  // A single glowing gold blade holding at × 1 while teal bot-dots deflect off a
  // faint shield ring. Calm, not the full arena.
  const R = 132; // ring radius
  return (
    <div
      className="lp-motif"
      aria-hidden
      style={{
        position: "relative",
        width: 360,
        height: 360,
        maxWidth: "100%",
        margin: "0 auto",
        display: "grid",
        placeItems: "center",
      }}
    >
      {/* outer atmosphere glow */}
      <div
        style={{
          position: "absolute",
          inset: 18,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,216,122,.13), rgba(46,230,207,.05) 55%, transparent 72%)",
          filter: "blur(6px)",
        }}
      />
      {/* faint base ring */}
      <div
        style={{
          position: "absolute",
          width: R * 2,
          height: R * 2,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,.09)",
        }}
      />
      {/* dashed shield ring (the deflection surface) */}
      <div
        className="lp-spin-slow"
        style={{
          position: "absolute",
          width: R * 2 - 22,
          height: R * 2 - 22,
          borderRadius: "50%",
          border: "1px dashed rgba(46,230,207,.30)",
        }}
      />

      {/* orbiting bot-dots that glance off the ring */}
      {[
        { dur: "13s", delay: "0s", color: C.teal },
        { dur: "17s", delay: "-6s", color: C.teal },
        { dur: "21s", delay: "-12s", color: C.violet },
      ].map((b, i) => (
        <div
          key={i}
          className="lp-orbit"
          style={{
            position: "absolute",
            width: R * 2,
            height: R * 2,
            animationDuration: b.dur,
            animationDelay: b.delay,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: -4,
              left: "50%",
              marginLeft: -4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: b.color,
              boxShadow: `0 0 12px ${b.color}`,
            }}
          />
        </div>
      ))}

      {/* center: the one legendary + its count */}
      <div
        className="lp-bob"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <span
          style={{
            width: 22,
            height: 104,
            borderRadius: 4,
            background: "linear-gradient(180deg,#fff1cf,#ffd87a 45%,#f0b94e)",
            boxShadow: "0 0 40px rgba(255,216,122,.7), 0 0 14px rgba(255,216,122,.9)",
            transform: "skewX(-9deg)",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 58,
            fontWeight: 800,
            color: C.gold,
            letterSpacing: "-.04em",
            textShadow: "0 0 30px rgba(255,216,122,.45)",
          }}
        >
          ×1
        </span>
      </div>
    </div>
  );
}

/* --------------------------------- buttons --------------------------------- */
function PrimaryCTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="lp-cta-primary"
      style={{
        fontFamily: MONO,
        fontSize: 14,
        fontWeight: 600,
        textDecoration: "none",
        color: "#06070b",
        background: "linear-gradient(180deg,#fff1cf,#f5c969)",
        border: "1px solid rgba(255,216,122,.6)",
        borderRadius: 11,
        padding: "13px 22px",
        boxShadow: "0 0 30px rgba(255,216,122,.25)",
        display: "inline-block",
      }}
    >
      {children}
    </Link>
  );
}

function SecondaryCTA({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="lp-cta-secondary"
      style={{
        fontFamily: MONO,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        color: C.text,
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.13)",
        borderRadius: 11,
        padding: "13px 22px",
        display: "inline-block",
      }}
    >
      {children}
    </Link>
  );
}

/* =============================== the page ================================== */
export default function LandingPage() {
  const [verified, setVerified] = useState(false);

  // Optional live proof chip — fetch once, degrade silently on any failure.
  useEffect(() => {
    let alive = true;
    fetch("/api/world/proof")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && d.allPass) setVerified(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main style={{ position: "relative", overflow: "hidden" }}>
      <StyleBlock />

      {/* ============================== 1 · HERO ============================== */}
      <section style={{ ...sectionWrap, paddingTop: 92, paddingBottom: 96 }}>
        <div className="lp-hero-grid">
          {/* left — the pitch */}
          <div className="lp-rise">
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: ".24em",
                color: C.muted,
                textTransform: "uppercase",
                border: "1px solid rgba(255,255,255,.09)",
                background: "rgba(255,255,255,.02)",
                borderRadius: 999,
                padding: "7px 14px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.teal,
                  boxShadow: `0 0 10px ${C.teal}`,
                }}
              />
              Economy Integrity · Built on Aurora DSQL
            </div>

            <h1
              style={{
                fontFamily: MONO,
                fontWeight: 800,
                fontSize: "clamp(40px, 6.2vw, 70px)",
                lineHeight: 1.02,
                letterSpacing: "-.035em",
                margin: "26px 0 0",
                color: C.text,
              }}
            >
              Duplication,
              <br />
              made{" "}
              <span
                style={{
                  background: "linear-gradient(110deg,#2ee6cf,#a07bff)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                unrepresentable.
              </span>
            </h1>

            <p
              style={{
                fontFamily: SANS,
                fontSize: 18,
                lineHeight: 1.62,
                color: C.muted,
                maxWidth: 620,
                margin: "24px 0 0",
              }}
            >
              Duped is an economy kernel for online games. It removes item dupes,
              gold double-spends, and cross-region trade exploits — by making every
              economic action one atomic, idempotent transaction. The bug that&apos;s
              wrecked game economies for 25 years, gone at the data layer.
            </p>

            {/* proof line */}
            <div
              style={{
                ...panel,
                maxWidth: 620,
                margin: "26px 0 0",
                padding: "16px 18px",
                borderLeft: `2px solid ${C.gold}`,
                display: "flex",
                gap: 13,
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 15, color: C.gold, lineHeight: 1.5 }}>▸</span>
              <p style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.6, color: C.text, margin: 0 }}>
                We threw <strong style={{ color: C.text }}>10,000 bots</strong> at one
                legendary sword across two regions. It stayed{" "}
                <strong style={{ color: C.gold }}>exactly one</strong> — and you can run
                the SQL proof yourself.
              </p>
            </div>

            {/* CTAs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 13, marginTop: 30 }}>
              <PrimaryCTA href="/try">▸ Try the live demo</PrimaryCTA>
              <SecondaryCTA href="/docs">Read the docs</SecondaryCTA>
            </div>

            {/* live verified chip */}
            {verified && (
              <div
                className="lp-rise"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  marginTop: 22,
                  fontFamily: MONO,
                  fontSize: 11.5,
                  letterSpacing: ".04em",
                  color: C.green,
                  border: `1px solid rgba(67,224,143,.28)`,
                  background: "rgba(67,224,143,.06)",
                  borderRadius: 999,
                  padding: "6px 13px",
                }}
              >
                <span className="lp-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 9px ${C.green}` }} />
                live · legendary count = 1 · verified
              </div>
            )}
          </div>

          {/* right — the motif */}
          <div className="lp-rise" style={{ animationDelay: ".12s" }}>
            <HeroMotif />
          </div>
        </div>
      </section>

      {/* ============================ 2 · PROBLEM ============================ */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 96 }}>
        <SectionHeader n="01" title="The Problem" />
        <h2 style={h2Style}>A dupe bug is counterfeiting.</h2>
        <p style={leadStyle}>
          When a player duplicates a legendary or spends the same gold twice, the
          economy inflates and trust collapses. This isn&apos;t a fringe glitch — it has
          shipped in the biggest games ever made.
        </p>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(258px, 1fr))",
            marginTop: 36,
          }}
        >
          {[
            {
              game: "New World",
              year: "2021",
              body: "Amazon repeatedly froze all trading and gold transfers to stop item and gold dupes.",
            },
            {
              game: "Diablo II",
              year: "",
              body: "Item and gold dupes defined its black market for roughly 20 years.",
            },
            {
              game: "RuneScape",
              year: "",
              body: "Dupe incidents forced full economy rollbacks.",
            },
          ].map((c) => (
            <div key={c.game} style={{ ...panel, padding: "22px 22px 24px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 14 }}>
                <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: C.text }}>
                  {c.game}
                </span>
                {c.year && (
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim, letterSpacing: ".06em" }}>
                    ({c.year})
                  </span>
                )}
              </div>
              <p style={{ fontFamily: SANS, fontSize: 14.5, lineHeight: 1.6, color: C.muted, margin: 0 }}>
                {c.body}
              </p>
            </div>
          ))}
        </div>

        <p
          style={{
            fontFamily: SANS,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: C.text,
            margin: "34px 0 0",
            maxWidth: 760,
          }}
        >
          Teams of hundreds keep shipping dupes — because the root cause is{" "}
          <span style={{ color: C.teal }}>distributed-systems correctness</span>, not bad luck.
        </p>
      </section>

      {/* ============================ 3 · INSIGHT =========================== */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 96 }}>
        <SectionHeader n="02" title="The Insight" />
        <h2 style={h2Style}>
          A dupe isn&apos;t a game bug. It&apos;s a{" "}
          <span style={{ color: C.violet }}>double-commit</span> bug.
        </h2>
        <p style={leadStyle}>Every classic dupe is the same database failure in disguise.</p>

        <div style={{ ...panel, marginTop: 36, overflow: "hidden" }}>
          {/* header row */}
          <div
            className="lp-map-row"
            style={{
              borderBottom: "1px solid rgba(255,255,255,.07)",
              background: "rgba(255,255,255,.015)",
            }}
          >
            <span style={{ ...mapCell, fontFamily: MONO, fontSize: 11, letterSpacing: ".22em", color: C.dim, textTransform: "uppercase" }}>
              Exploit
            </span>
            <span style={{ ...mapCell, fontFamily: MONO, fontSize: 11, letterSpacing: ".22em", color: C.dim, textTransform: "uppercase" }}>
              Correctness property
            </span>
          </div>

          {[
            ["Trade-window race", "Exactly-once — version-guarded transfer"],
            ["Drop-and-relog", "Atomicity — all-or-nothing"],
            ["Disconnect mid-trade", "Atomic rollback"],
            ["Cross-region dupe", "Active-active strong consistency"],
            ["Gold double-spend", "Conditional atomic debit"],
          ].map(([ex, prop], i, arr) => (
            <div
              key={ex}
              className="lp-map-row"
              style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none" }}
            >
              <span style={{ ...mapCell, fontFamily: SANS, fontSize: 15, color: C.text, display: "flex", alignItems: "center", gap: 11 }}>
                <span style={{ color: C.rose, fontFamily: MONO, fontSize: 13 }}>✕</span>
                {ex}
              </span>
              <span style={{ ...mapCell, fontFamily: MONO, fontSize: 13.5, color: C.teal, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: C.dimmer }}>→</span>
                {prop}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            fontFamily: SANS,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: C.text,
            margin: "34px 0 0",
            maxWidth: 720,
          }}
        >
          Fix the consistency, and duplication has{" "}
          <span style={{ color: C.gold }}>nowhere to live.</span>
        </p>
      </section>

      {/* =========================== 4 · HOW IT WORKS ====================== */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 96 }}>
        <SectionHeader n="03" title="How It Works" />
        <h2 style={h2Style}>A sword is not money — so we protect them differently.</h2>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            marginTop: 36,
          }}
        >
          {/* unique items */}
          <div style={{ ...panel, padding: "26px 26px 28px", borderTop: `2px solid ${C.gold}` }}>
            <div style={cardKicker(C.gold)}>UNIQUE ITEMS</div>
            <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: C.muted, margin: "0 0 18px" }}>
              Every unique item is exactly one row with one owner and a version. Moving
              it is a conditional <code style={inlineCode}>UPDATE</code> that must match the
              current owner + version — two concurrent transfers can&apos;t both match, so
              exactly one wins. <span style={{ color: C.text }}>&ldquo;Owned twice&rdquo; has no representation.</span>
            </p>
            <pre style={codeBlock}>
              <span style={{ color: C.violet }}>UPDATE</span> item_instances <span style={{ color: C.violet }}>SET</span> owner_id=
              <span style={{ color: C.teal }}>:to</span>, version=version+<span style={{ color: C.gold }}>1</span>
              {"\n"} <span style={{ color: C.violet }}>WHERE</span> instance_id=<span style={{ color: C.teal }}>:id</span>{" "}
              <span style={{ color: C.violet }}>AND</span> owner_id=<span style={{ color: C.teal }}>:from</span>{" "}
              <span style={{ color: C.violet }}>AND</span> version=<span style={{ color: C.teal }}>:expected</span>;
              {"\n"}
              <span style={{ color: C.dimmer }}>{"-- rowCount must be 1"}</span>
            </pre>
          </div>

          {/* gold */}
          <div style={{ ...panel, padding: "26px 26px 28px", borderTop: `2px solid ${C.teal}` }}>
            <div style={cardKicker(C.teal)}>GOLD</div>
            <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.6, color: C.muted, margin: "0 0 18px" }}>
              Balances are sharded and can&apos;t go negative; every transfer writes a
              balanced double-entry ledger. Supply in = supply out, to the minor unit.{" "}
              <span style={{ color: C.text }}>No inflation.</span>
            </p>
            <div
              style={{
                display: "grid",
                gap: 10,
                fontFamily: MONO,
                fontSize: 13,
              }}
            >
              {[
                ["balance_minor", "CHECK ≥ 0", C.green],
                ["ledger Σ(signed)", "= 0", C.green],
                ["supply in", "= supply out", C.green],
              ].map(([k, v, col]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "11px 14px",
                    background: "rgba(0,0,0,.22)",
                    border: "1px solid rgba(255,255,255,.05)",
                    borderRadius: 10,
                  }}
                >
                  <span style={{ color: C.muted }}>{k}</span>
                  <span style={{ color: col as string, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================== 5 · PROOF =========================== */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 96 }}>
        <SectionHeader n="04" title="The Proof" />
        <h2 style={h2Style}>One query proves it.</h2>
        <p style={leadStyle}>
          No dashboards to trust — the invariants are runnable SQL against the live
          truth core. Here&apos;s the same check the demo runs on camera.
        </p>

        {/* terminal */}
        <div style={{ ...panel, marginTop: 36, overflow: "hidden", maxWidth: 760 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              borderBottom: "1px solid rgba(255,255,255,.07)",
              background: "rgba(255,255,255,.015)",
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#febc2e" }} />
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim, marginLeft: 8, letterSpacing: ".05em" }}>
              pnpm reconcile
            </span>
          </div>
          <div style={{ padding: "20px 20px 22px", fontFamily: MONO, fontSize: 13.5, lineHeight: 1.95 }}>
            {[
              ["legendary count", "1"],
              ["gold supply", "= minted  (drift 0)"],
              ["ledger drift", "0"],
              ["every txn balanced", "true"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: C.green }}>✓</span>
                <span style={{ color: C.muted, minWidth: 188, display: "inline-block" }}>{k}</span>
                <span style={{ color: C.dimmer }}>=</span>
                <span style={{ color: C.text }}>{v}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, color: C.green, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="lp-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, boxShadow: `0 0 9px ${C.green}` }} />
              ALL INVARIANTS PASS
            </div>
          </div>
        </div>

        <div style={{ marginTop: 30 }}>
          <PrimaryCTA href="/try">Run it yourself in the live demo ▸</PrimaryCTA>
        </div>
      </section>

      {/* ============================ 6 · BUILT ON ========================== */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 96 }}>
        <SectionHeader n="05" title="Built On" />

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(258px, 1fr))",
          }}
        >
          {[
            {
              name: "Aurora DSQL",
              col: C.gold,
              body: "Strongly-consistent, active-active multi-region truth core. The single source of authoritative economy state.",
            },
            {
              name: "DynamoDB",
              col: C.teal,
              body: "The live world read model — written only by the outbox projector, never inside a trade.",
            },
            {
              name: "Vercel",
              col: C.violet,
              body: "Edge deploy with OIDC auth — no credentials in code, from local dev to production.",
            },
          ].map((s) => (
            <div key={s.name} style={{ ...panel, padding: "24px 24px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.col, boxShadow: `0 0 10px ${s.col}` }} />
                <span style={{ fontFamily: MONO, fontSize: 15.5, fontWeight: 700, color: C.text }}>{s.name}</span>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.6, color: C.muted, margin: 0 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        {/* architecture caption */}
        <div
          style={{
            ...panel,
            marginTop: 18,
            padding: "16px 20px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            fontFamily: MONO,
            fontSize: 13,
            color: C.muted,
          }}
        >
          <span style={{ color: C.dim }}>agents</span>
          <span style={{ color: C.dimmer }}>→</span>
          <span style={{ color: C.text }}>trade kernel</span>
          <span style={{ color: C.dimmer }}>→</span>
          <span style={{ color: C.gold }}>Aurora DSQL</span>
          <span style={{ color: C.dimmer }}>⇄</span>
          <span style={{ color: C.teal }}>DynamoDB</span>
          <span style={{ color: C.dimmer }}>→</span>
          <span style={{ color: C.text }}>live world</span>
        </div>
      </section>

      {/* ============================ 7 · FOOTER CTA ======================== */}
      <section style={{ ...sectionWrap, paddingTop: 44, paddingBottom: 110 }}>
        <div
          style={{
            ...panel,
            position: "relative",
            overflow: "hidden",
            padding: "64px 36px 70px",
            textAlign: "center",
            background:
              "radial-gradient(700px 380px at 50% -40%, rgba(255,216,122,.10), transparent 70%), rgba(255,255,255,.022)",
          }}
        >
          <h2
            style={{
              fontFamily: MONO,
              fontWeight: 800,
              fontSize: "clamp(28px, 4.4vw, 44px)",
              letterSpacing: "-.03em",
              color: C.text,
              margin: 0,
            }}
          >
            Ready to make dupes{" "}
            <span
              style={{
                background: "linear-gradient(110deg,#ffd87a,#a07bff)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              impossible?
            </span>
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 13,
              justifyContent: "center",
              marginTop: 30,
            }}
          >
            <PrimaryCTA href="/try">▸ Try the live demo</PrimaryCTA>
            <SecondaryCTA href="/docs">Read the docs</SecondaryCTA>
          </div>
          <p
            style={{
              fontFamily: MONO,
              fontSize: 11.5,
              letterSpacing: ".08em",
              color: C.dim,
              margin: "34px 0 0",
            }}
          >
            Built for the H0 hackathon · Million-Scale Global App (gaming)
          </p>
        </div>
      </section>
    </main>
  );
}

/* ------------------------------ shared styles ------------------------------ */
const h2Style: React.CSSProperties = {
  fontFamily: MONO,
  fontWeight: 700,
  fontSize: "clamp(26px, 3.6vw, 38px)",
  letterSpacing: "-.025em",
  lineHeight: 1.12,
  color: C.text,
  margin: 0,
};

const leadStyle: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 16.5,
  lineHeight: 1.62,
  color: C.muted,
  maxWidth: 700,
  margin: "18px 0 0",
};

const mapCell: React.CSSProperties = {
  padding: "16px 22px",
};

const cardKicker = (col: string): React.CSSProperties => ({
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".26em",
  color: col,
  marginBottom: 16,
});

const inlineCode: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12.5,
  color: C.teal,
  background: "rgba(46,230,207,.08)",
  padding: "1px 6px",
  borderRadius: 5,
};

const codeBlock: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 12.5,
  lineHeight: 1.7,
  color: C.muted,
  background: "rgba(0,0,0,.28)",
  border: "1px solid rgba(255,255,255,.06)",
  borderRadius: 11,
  padding: "16px 16px",
  margin: 0,
  whiteSpace: "pre-wrap",
  overflowX: "auto",
};

/* ------------------------ animations + responsive ------------------------- */
function StyleBlock() {
  return (
    <style>{`
      @keyframes lpRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes lpOrbit { to { transform: rotate(360deg); } }
      @keyframes lpSpin { to { transform: rotate(360deg); } }
      @keyframes lpBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes lpPulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

      .lp-rise { animation: lpRise .7s cubic-bezier(.2,.7,.2,1) both; }
      .lp-orbit { animation: lpOrbit linear infinite; }
      .lp-spin-slow { animation: lpSpin 60s linear infinite; }
      .lp-bob { animation: lpBob 5s ease-in-out infinite; }
      .lp-pulse { animation: lpPulse 1.8s ease-in-out infinite; }

      .lp-cta-primary, .lp-cta-secondary { transition: transform .14s ease, box-shadow .14s ease, background .14s ease, border-color .14s ease; }
      .lp-cta-primary:hover { transform: translateY(-2px); box-shadow: 0 0 40px rgba(255,216,122,.45); }
      .lp-cta-secondary:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.26); background: rgba(255,255,255,.06); }

      .lp-hero-grid {
        display: grid;
        grid-template-columns: 1.15fr .85fr;
        align-items: center;
        gap: 48px;
      }
      .lp-map-row {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
      }

      @media (max-width: 900px) {
        .lp-hero-grid { grid-template-columns: 1fr; gap: 40px; }
        .lp-motif { width: 300px !important; height: 300px !important; }
      }
      @media (max-width: 620px) {
        .lp-map-row { grid-template-columns: 1fr; }
        .lp-map-row > span:first-child { padding-bottom: 4px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .lp-rise, .lp-orbit, .lp-spin-slow, .lp-bob, .lp-pulse { animation: none !important; }
      }
    `}</style>
  );
}
