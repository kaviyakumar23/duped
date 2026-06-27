"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  Duped — PRODUCT DOCS. A single polished docs page: sticky in-page sidebar  */
/*  on the left, well-typeset reference content on the right. Aurora theme,    */
/*  inline styles + CSS vars. Server-truthful: every shape, command, code      */
/*  block, and failure code is drawn from lib/types.ts, lib/world/invariants,  */
/*  README.md and CLAUDE.md. The shared top nav comes from the layout.         */
/* -------------------------------------------------------------------------- */

const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";
const SANS = "var(--font-sora), 'Sora', system-ui, sans-serif";

const C = {
  text: "#e8eaf0",
  muted: "#9aa0b2",
  dim: "#6b7186",
  teal: "#2ee6cf",
  violet: "#a07bff",
  gold: "#ffd87a",
  green: "#43e08f",
  red: "#ff5f7e",
  panel: "rgba(255,255,255,.022)",
  panelHi: "rgba(255,255,255,.04)",
  border: "rgba(255,255,255,.07)",
  borderHi: "rgba(255,255,255,.11)",
  code: "#9fd9cf",
  codeBg: "rgba(0,0,0,.32)",
};

const NAV: { id: string; label: string; n: string }[] = [
  { id: "overview", label: "Overview", n: "01" },
  { id: "concepts", label: "Concepts", n: "02" },
  { id: "quickstart", label: "Quickstart", n: "03" },
  { id: "api", label: "API Reference", n: "04" },
  { id: "architecture", label: "Architecture", n: "05" },
  { id: "integration", label: "Integration", n: "06" },
];

/* ----------------------------------- bits --------------------------------- */

function Code({ children, lang }: { children: string; lang?: string }) {
  return (
    <div style={{ position: "relative", margin: "18px 0" }}>
      {lang ? (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: ".22em",
            color: C.dim,
            textTransform: "uppercase",
          }}
        >
          {lang}
        </span>
      ) : null}
      <pre
        style={{
          margin: 0,
          padding: "16px 18px",
          background: C.codeBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflowX: "auto",
          fontFamily: MONO,
          fontSize: 12.5,
          lineHeight: 1.7,
          color: C.code,
          whiteSpace: "pre",
        }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Tok({ children, color }: { children: ReactNode; color: string }) {
  return (
    <code
      style={{
        fontFamily: MONO,
        fontSize: 12,
        color,
        background: "rgba(255,255,255,.045)",
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        padding: "1px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </code>
  );
}

function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Section({
  id,
  n,
  kicker,
  title,
  children,
}: {
  id: string;
  n: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ scrollMarginTop: 90, marginBottom: 76 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 13, marginBottom: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.teal, letterSpacing: ".1em" }}>
          {n}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".26em",
            textTransform: "uppercase",
            color: C.dim,
          }}
        >
          {kicker}
        </span>
      </div>
      <h2
        style={{
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 27,
          letterSpacing: "-.02em",
          margin: "0 0 18px",
          color: C.text,
        }}
      >
        {title}
      </h2>
      <div style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.72, color: "#c7ccda" }}>
        {children}
      </div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: MONO,
        fontWeight: 600,
        fontSize: 15.5,
        letterSpacing: "-.01em",
        margin: "34px 0 12px",
        color: C.text,
      }}
    >
      {children}
    </h3>
  );
}

function Field({
  name,
  type,
  children,
  req,
}: {
  name: string;
  type: string;
  children: ReactNode;
  req?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px,200px) 1fr",
        gap: 14,
        padding: "12px 0",
        borderTop: `1px solid ${C.border}`,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 12.5,
            color: C.text,
            wordBreak: "break-word",
          }}
        >
          {name}
          {req ? <span style={{ color: C.red, marginLeft: 3 }}>*</span> : null}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.teal, marginTop: 3 }}>{type}</div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
        {children}
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: ".04em",
        color,
        border: `1px solid ${color}44`,
        background: `${color}12`,
        borderRadius: 999,
        padding: "3px 9px",
      }}
    >
      {children}
    </span>
  );
}

/* ----------------------------------- page --------------------------------- */

export default function DocsPage() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );
    NAV.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <main
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: "0 28px 120px",
        fontFamily: SANS,
        color: C.text,
      }}
    >
      {/* masthead */}
      <header style={{ padding: "54px 0 30px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Pill color={C.teal}>DOCUMENTATION</Pill>
          <Pill color={C.violet}>v1 · KERNEL API</Pill>
        </div>
        <h1
          style={{
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: "clamp(30px, 5vw, 46px)",
            letterSpacing: "-.03em",
            lineHeight: 1.04,
            margin: "0 0 16px",
          }}
        >
          The economy kernel,
          <br />
          <span style={{ color: C.muted }}>documented for builders.</span>
        </h1>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 16.5,
            lineHeight: 1.62,
            color: C.muted,
            maxWidth: 720,
            margin: 0,
          }}
        >
          Duped is a globally consistent economy kernel for online games. It makes item and gold
          duplication{" "}
          <span style={{ color: C.text }}>unrepresentable in the authoritative state</span> — as
          long as every economic action goes through the kernel. These docs cover the model, the
          public API, and how a studio adopts it.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "230px 1fr",
          gap: 56,
          alignItems: "start",
        }}
      >
        {/* sidebar */}
        <aside
          className="docs-sidebar"
          style={{
            position: "sticky",
            top: 78,
            alignSelf: "start",
            paddingTop: 44,
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: ".26em",
              color: C.dim,
              marginBottom: 16,
              paddingLeft: 14,
            }}
          >
            ON THIS PAGE
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((s) => {
              const on = active === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    textDecoration: "none",
                    padding: "8px 14px",
                    borderRadius: 9,
                    borderLeft: `2px solid ${on ? C.teal : "transparent"}`,
                    background: on ? "rgba(46,230,207,.07)" : "transparent",
                    color: on ? C.text : C.muted,
                    fontFamily: MONO,
                    fontSize: 13,
                    transition: "color .15s, background .15s",
                  }}
                >
                  <span style={{ fontSize: 10, color: on ? C.teal : C.dim }}>{s.n}</span>
                  {s.label}
                </a>
              );
            })}
          </nav>
          <div
            style={{
              marginTop: 24,
              marginLeft: 14,
              paddingTop: 20,
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <a
              href="/try"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: MONO,
                fontSize: 12,
                color: C.gold,
                textDecoration: "none",
              }}
            >
              Open the live world ▸
            </a>
          </div>
        </aside>

        {/* content */}
        <div style={{ minWidth: 0, paddingTop: 44 }}>
          {/* ---------------------------------------------------------------- */}
          <Section id="overview" n="01" kicker="What it is" title="Overview">
            <p style={{ marginTop: 0 }}>
              A dupe bug lets a player end up with two of something that should exist once — a
              legendary blade, a stack of gold. It has wrecked game economies for 25 years (New
              World, Diablo II, RuneScape, EVE, WoW) because the root cause is{" "}
              <span style={{ color: C.text }}>distributed-systems correctness</span>, not bad luck.
              Duped removes the root cause: every economic action is one atomic, idempotent
              transaction through a kernel, and uniqueness becomes a property the data model cannot
              violate.
            </p>

            <Panel
              style={{
                margin: "24px 0",
                borderColor: C.borderHi,
                background:
                  "linear-gradient(135deg, rgba(46,230,207,.05), rgba(160,123,255,.04))",
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".22em",
                  color: C.dim,
                  marginBottom: 10,
                }}
              >
                THE THESIS
              </div>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.text }}>
                Duped makes item and gold duplication{" "}
                <span style={{ color: C.teal }}>unrepresentable in the authoritative state</span> —
                as long as every economic action goes through the kernel. Uniqueness isn&apos;t a
                check you run; it&apos;s a property the data model can&apos;t express.
              </p>
            </Panel>

            <p>
              Each classic exploit is a concurrency failure with a precise correctness property
              behind it:
            </p>

            <div style={{ margin: "18px 0", overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13.5,
                  minWidth: 460,
                }}
              >
                <thead>
                  <tr>
                    {["Classic exploit", "What goes wrong", "Property enforced"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          fontFamily: MONO,
                          fontSize: 10,
                          letterSpacing: ".14em",
                          color: C.dim,
                          padding: "0 14px 10px 0",
                          textTransform: "uppercase",
                          borderBottom: `1px solid ${C.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ color: C.muted }}>
                  {[
                    ["Trade-window race", "two trades move one item", "version-guarded transfer"],
                    ["Drop-and-relog", "item in world and inventory", "atomic all-or-nothing"],
                    ["Disconnect mid-trade", "one side credited, other not", "atomic rollback"],
                    ["Cross-region dupe", "item exists in two regions", "active-active consistency"],
                    ["Gold double-spend", "same coins spent twice", "conditional atomic debit"],
                  ].map((r) => (
                    <tr key={r[0]}>
                      <td
                        style={{
                          padding: "11px 14px 11px 0",
                          borderBottom: `1px solid ${C.border}`,
                          color: C.text,
                          fontFamily: MONO,
                          fontSize: 12.5,
                        }}
                      >
                        {r[0]}
                      </td>
                      <td style={{ padding: "11px 14px 11px 0", borderBottom: `1px solid ${C.border}` }}>
                        {r[1]}
                      </td>
                      <td
                        style={{
                          padding: "11px 0",
                          borderBottom: `1px solid ${C.border}`,
                          color: C.green,
                          fontFamily: MONO,
                          fontSize: 12.5,
                        }}
                      >
                        {r[2]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H3>Scope — what Duped is, and isn&apos;t</H3>
            <p>
              Duped is the economy and trade{" "}
              <span style={{ color: C.text }}>settlement layer</span>: trades, drops, pickups, mail,
              auction-house fills, gold transfers, and cross-region item movement. It is{" "}
              <span style={{ color: C.text }}>not</span> the real-time combat loop, movement,
              accounts, matchmaking, or art. It owns the authoritative answer to{" "}
              <em>&ldquo;who owns what, and how much gold exists&rdquo;</em> — and nothing more. The
              guarantees hold for exactly the actions that pass through it.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="concepts" n="02" kicker="The model" title="Concepts">
            <p style={{ marginTop: 0 }}>
              Duped models two kinds of economic object and protects each with the mechanism that
              actually fits it. <em>A sword is not money</em> — so they are never forced into the
              same structure.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))",
                gap: 16,
                margin: "22px 0",
              }}
            >
              <Panel>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: C.gold }} />
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.gold }}>
                    UNIQUE ITEMS
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
                  One row per item in{" "}
                  <Tok color={C.text}>item_instances</Tok>, with exactly one{" "}
                  <Tok color={C.text}>owner_id</Tok> and a{" "}
                  <Tok color={C.text}>version</Tok>. Every move — trade, drop, pickup, mail — is the
                  same version-guarded conditional <Tok color={C.text}>UPDATE</Tok>. &ldquo;Owned
                  twice&rdquo; has no representation.
                </p>
              </Panel>
              <Panel>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: C.green }} />
                  <span style={{ fontFamily: MONO, fontSize: 13, color: C.green }}>
                    FUNGIBLE GOLD
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: C.muted }}>
                  Sharded balances in <Tok color={C.text}>currency_shards</Tok> with a{" "}
                  <Tok color={C.text}>CHECK balance_minor &gt;= 0</Tok> that makes overspend
                  structurally impossible, plus a balanced double-entry ledger written in the same
                  transaction. <Tok color={C.text}>SUM = 0</Tok> proves no inflation.
                </p>
              </Panel>
            </div>

            <H3>The version-guarded transfer</H3>
            <p>
              The entire anti-dupe guarantee for unique items is this one conditional update. The
              row only moves if its current <Tok color={C.text}>(owner, version)</Tok> still matches
              what the caller read:
            </p>
            <Code lang="sql">{`UPDATE item_instances
   SET owner_type = :to_type,
       owner_id   = :to_id,
       region     = :region,
       version    = version + 1,
       updated_at = now()
 WHERE instance_id = :id
   AND owner_type  = :from_type
   AND owner_id    = :from_id
   AND version     = :expected;
-- rowCount MUST be 1. If 0 -> someone already moved it -> abort -> ITEM_MOVED`}</Code>
            <p>
              Two concurrent transfers cannot both match{" "}
              <Tok color={C.text}>owner_id = :from AND version = :expected</Tok>. The first to commit
              bumps the version; the second matches zero rows — or conflicts at{" "}
              <Tok color={C.text}>COMMIT</Tok> (DSQL surfaces OCC write conflicts as{" "}
              <Tok color={C.red}>SQLSTATE 40001</Tok>), retries with the same key, re-reads, and
              still finds zero rows. <span style={{ color: C.text }}>Exactly one wins, globally.</span>
            </p>

            <H3>The trade kernel</H3>
            <p>
              <Tok color={C.teal}>executeTrade(req)</Tok> is the <em>only</em> way the authoritative
              economy changes. One attempt is one DSQL transaction:
            </p>
            <ol style={{ paddingLeft: 20, margin: "12px 0", lineHeight: 1.7 }}>
              <li>
                <strong style={{ color: C.text }}>Idempotency check</strong> — a registry hit with a
                matching request hash replays the stored snapshot; same key + different payload is a{" "}
                <Tok color={C.red}>409</Tok>.
              </li>
              <li>
                <strong style={{ color: C.text }}>Item legs</strong> — each is the version-guarded
                update above; any miss rolls the whole trade back.
              </li>
              <li>
                <strong style={{ color: C.text }}>Gold legs</strong> — a sharded conditional debit of
                the payer and credit of the payee; no shard covers it ⇒{" "}
                <Tok color={C.text}>INSUFFICIENT_FUNDS</Tok>.
              </li>
              <li>
                <strong style={{ color: C.text }}>Record</strong> — trade header, provenance, the
                balanced ledger (when gold moved), the idempotency registry, and the event outbox,
                all in the same transaction.
              </li>
              <li>
                <strong style={{ color: C.text }}>Commit</strong> — on{" "}
                <Tok color={C.red}>40001</Tok>, roll back, jittered backoff, retry with the same key.
                Retries are surfaced on <Tok color={C.text}>snapshot.attempts</Tok>, never hidden.
              </li>
            </ol>

            <H3>Invariants — the properties that always hold</H3>
            <p>
              Correctness is checkable as plain SQL against the truth core. The same queries power{" "}
              <Tok color={C.text}>pnpm reconcile</Tok>, the <Tok color={C.text}>/api/world/proof</Tok>{" "}
              route, and the live invariant board — so the number on the dashboard and the number in
              the proof are the same number.
            </p>
            <div style={{ display: "grid", gap: 8, margin: "16px 0" }}>
              {[
                ["Legendary exists exactly once", "count = 1", C.gold],
                ["No item instance owned twice", "= 0", C.teal],
                ["Every item has exactly one owner", "0 ownerless", C.teal],
                ["Gold supply conserved (no inflation)", "= minted", C.green],
                ["Gold ledger drift is zero", "SUM = 0", C.green],
                ["Every gold transaction is balanced", "0 unbalanced", C.green],
                ["No negative gold balance", "= 0", C.green],
              ].map((r) => (
                <div
                  key={r[0]}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "11px 14px",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: 13.5, color: C.text }}>{r[0]}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: r[2] as string }}>
                    {r[1]}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="quickstart" n="03" kicker="Run it locally" title="Quickstart">
            <p style={{ marginTop: 0 }}>
              Duped runs on <span style={{ color: C.text }}>Aurora DSQL</span> (IAM / Vercel OIDC
              auth — no passwords) as the truth core and <span style={{ color: C.text }}>DynamoDB</span>{" "}
              as the live read model. Money is always <Tok color={C.text}>BIGINT</Tok> minor units (1
              gold = 100 minor); there are no foreign keys, and indexes are created{" "}
              <Tok color={C.text}>ASYNC</Tok>.
            </p>

            <H3>Bring up the world</H3>
            <Code lang="bash">{`pnpm install
pnpm db:check          # SELECT NOW() — confirm DSQL connectivity
pnpm db:migrate        # apply schema (one DDL per txn; indexes ASYNC)
pnpm db:index-status   # wait for indexes ACTIVE before traffic
pnpm db:setup-ddb      # create the DynamoDB world read-model table
pnpm db:seed           # Aetheria: ONE legendary, whale gold, players
pnpm dev               # the live world at http://localhost:3000`}</Code>

            <H3>Run the attacks and prove it</H3>
            <Code lang="bash">{`pnpm storm                 # the dupe storm — thousands of bots vs ONE legendary
pnpm storm --gold          # the gold double-spend storm
pnpm storm --market --sweep # independent-trade throughput sweep (scale)
pnpm reconcile             # the SQL proof: legendary=1, gold conserved, drift=0
pnpm projector             # drain the outbox -> DynamoDB (run during/after a storm)`}</Code>
            <p>
              Local dev uses <Tok color={C.text}>.env.local</Tok> (a single-region cluster). For the
              real Tokyo⇄Seoul cross-region demo, use <Tok color={C.text}>.env.mr</Tok> (a peered
              cluster), e.g.{" "}
              <Tok color={C.text}>pnpm exec tsx --env-file=.env.mr scripts/&lt;script&gt;.ts</Tok>.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="api" n="04" kicker="The kernel endpoint" title="API Reference">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                background: C.panel,
                border: `1px solid ${C.borderHi}`,
                borderRadius: 12,
                margin: "0 0 8px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.green,
                  border: `1px solid ${C.green}55`,
                  borderRadius: 6,
                  padding: "3px 9px",
                }}
              >
                POST
              </span>
              <span style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>/api/v1/trades</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: C.muted, marginLeft: "auto" }}>
                The public kernel endpoint. Takes a <Tok color={C.text}>TradeRequest</Tok>, returns a{" "}
                <Tok color={C.text}>TradeSnapshot</Tok>.
              </span>
            </div>
            <p>
              A single call settles a two-sided atomic exchange. A <Tok color={C.text}>DROP</Tok>,{" "}
              <Tok color={C.text}>PICKUP</Tok>, or <Tok color={C.text}>MAIL</Tok> is the same
              machinery with <Tok color={C.text}>WORLD</Tok> / <Tok color={C.text}>MAIL</Tok> as one
              side. Always send a stable <Tok color={C.text}>idempotencyKey</Tok> — the same key with
              the same payload replays the stored snapshot exactly.
            </p>

            <H3>Request — TradeRequest</H3>
            <Panel style={{ padding: "4px 20px 16px" }}>
              <Field name="realmId" type="string" req>
                The realm / world the trade settles in.
              </Field>
              <Field name="idempotencyKey" type="string" req>
                Exactly-once guard, keyed with the realm. Same key + same payload replays; same key +
                different payload is rejected with <Tok color={C.red}>409</Tok>.
              </Field>
              <Field name="kind" type="'TRADE' | 'DROP' | 'PICKUP' | 'MAIL'" req>
                Descriptive label for the move. All kinds use the same version guard.
              </Field>
              <Field name="playerA / playerB" type="string" req>
                The two display identities recorded on the trade.
              </Field>
              <Field name="itemLegs" type="ItemLeg[]" req>
                Unique-item ownership moves (may be empty for a pure gold transfer).
              </Field>
              <Field name="goldLegs" type="GoldLeg[]" req>
                Fungible gold movements (may be empty for a pure item trade).
              </Field>
              <Field name="currency" type="string" req>
                Currency code for the gold legs and ledger (e.g. <Tok color={C.text}>GOLD</Tok>).
              </Field>
              <Field name="region" type="'TOKYO' | 'SEOUL'" req>
                Which regional DSQL endpoint settles the trade — TOKYO is primary, SEOUL secondary.
              </Field>
            </Panel>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))",
                gap: 16,
                margin: "20px 0",
              }}
            >
              <Panel style={{ padding: "4px 20px 14px" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: C.gold,
                    padding: "14px 0 4px",
                  }}
                >
                  ItemLeg
                </div>
                <Field name="instanceId" type="string">
                  The unique item being moved.
                </Field>
                <Field name="expectedVersion" type="number">
                  The version the caller read. A mismatch ⇒ <Tok color={C.text}>ITEM_MOVED</Tok>.
                </Field>
                <Field name="fromOwnerType / fromOwnerId" type="OwnerType / string">
                  Current owner the move is guarded against.
                </Field>
                <Field name="toOwnerType / toOwnerId" type="OwnerType / string">
                  Destination owner. <Tok color={C.text}>PLAYER | WORLD | ESCROW | MAIL</Tok>.
                </Field>
              </Panel>
              <Panel style={{ padding: "4px 20px 14px" }}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: C.green,
                    padding: "14px 0 4px",
                  }}
                >
                  GoldLeg
                </div>
                <Field name="fromPlayerId" type="string">
                  Payer — debited from a covering shard.
                </Field>
                <Field name="toPlayerId" type="string">
                  Payee — credited.
                </Field>
                <Field name="amountMinor" type="number">
                  Amount in minor units (BIGINT-safe integer; 1 gold = 100 minor).
                </Field>
              </Panel>
            </div>

            <H3>Response — TradeSnapshot</H3>
            <Panel style={{ padding: "4px 20px 16px" }}>
              <Field name="outcome" type="'COMMITTED' | 'DECLINED'">
                Whether the trade settled. A <Tok color={C.text}>DECLINED</Tok> is a deterministic
                business outcome, not an error.
              </Field>
              <Field name="tradeId" type="string">
                The trade header id.
              </Field>
              <Field name="movedItems" type="MovedItem[]">
                Items that changed hands, each with{" "}
                <Tok color={C.text}>instanceId, fromOwnerId, toOwnerId, versionAfter</Tok>. Present
                on commit.
              </Field>
              <Field name="goldMovedMinor" type="number">
                Total gold (minor units) moved across all gold legs.
              </Field>
              <Field name="ledgerTxnId" type="string?">
                Present on commit when any gold moved.
              </Field>
              <Field name="failureCode" type="TradeFailureCode?">
                Present on decline — see the codes below.
              </Field>
              <Field name="attempts" type="number">
                Number of attempts the kernel made (1 + OCC 40001 retries). Surfaced, never hidden.
              </Field>
              <Field name="replayed" type="boolean">
                True when the response came from the idempotency registry rather than a fresh commit.
              </Field>
              <Field name="committedAt" type="string?">
                ISO timestamp, present on commit.
              </Field>
            </Panel>

            <H3>Outcomes &amp; failure codes</H3>
            <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
              {[
                ["DECLINED", "ITEM_MOVED", "an item's (owner, version) no longer matches", C.gold],
                ["DECLINED", "INSUFFICIENT_FUNDS", "no shard could cover a gold leg", C.gold],
                ["DECLINED", "ITEM_NOT_FOUND", "the instance row doesn't exist in this realm", C.gold],
                ["DECLINED", "INVALID_REQUEST", "structurally invalid leg set caught at runtime", C.gold],
              ].map((r) => (
                <div
                  key={r[1]}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 180px 1fr",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 14px",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>{r[0]}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: r[3] as string }}>
                    {r[1]}
                  </span>
                  <span style={{ fontSize: 13, color: C.muted }}>{r[2]}</span>
                </div>
              ))}
            </div>

            <H3>HTTP status codes</H3>
            <div style={{ display: "grid", gap: 8, margin: "12px 0" }}>
              {[
                ["201", "Created — trade COMMITTED", C.green],
                ["200", "OK — trade DECLINED (deterministic business outcome)", C.gold],
                ["400", "VALIDATION_ERROR — malformed request", C.red],
                ["404", "NOT_FOUND — realm or instance missing", C.red],
                ["409", "Idempotency key reused with a different payload", C.red],
                ["503", "RETRY_EXHAUSTED — OCC 40001 storm beyond max attempts", C.red],
              ].map((r) => (
                <div
                  key={r[0]}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 14px",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      fontWeight: 700,
                      color: r[2] as string,
                      minWidth: 38,
                    }}
                  >
                    {r[0]}
                  </span>
                  <span style={{ fontSize: 13.5, color: C.muted }}>{r[1]}</span>
                </div>
              ))}
            </div>

            <H3>Example — settle a trade</H3>
            <Code lang="bash">{`curl -X POST https://your-app.vercel.app/api/v1/trades \\
  -H "Content-Type: application/json" \\
  -d '{
    "realmId": "aetheria",
    "idempotencyKey": "trade-7f3c1a-001",
    "kind": "TRADE",
    "playerA": "player-aria",
    "playerB": "player-kade",
    "itemLegs": [
      {
        "instanceId": "blade-of-dawn-0001",
        "expectedVersion": 4,
        "fromOwnerType": "PLAYER", "fromOwnerId": "player-aria",
        "toOwnerType": "PLAYER",   "toOwnerId": "player-kade"
      }
    ],
    "goldLegs": [
      { "fromPlayerId": "player-kade", "toPlayerId": "player-aria", "amountMinor": 250000 }
    ],
    "currency": "GOLD",
    "region": "TOKYO"
  }'`}</Code>
            <Code lang="json">{`// 201 Created
{
  "outcome": "COMMITTED",
  "tradeId": "trade-2b9e...",
  "kind": "TRADE",
  "movedItems": [
    { "instanceId": "blade-of-dawn-0001",
      "fromOwnerId": "player-aria", "toOwnerId": "player-kade",
      "versionAfter": 5 }
  ],
  "goldMovedMinor": 250000,
  "ledgerTxnId": "ldg-04c7...",
  "attempts": 2,
  "replayed": false,
  "committedAt": "2026-06-27T10:14:02.118Z"
}`}</Code>

            <H3>World read endpoints</H3>
            <p>
              These serve the DynamoDB read model and the demo levers (read-only telemetry plus the
              storm controls):
            </p>
            <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
              {[
                ["GET", "/api/world/snapshot", "current world read model"],
                ["GET", "/api/world/stream", "live SSE feed of world events"],
                ["GET", "/api/world/proof", "run the invariant SQL on demand"],
                ["POST", "/api/world/storm", "fire the dupe storm"],
                ["POST", "/api/world/gold-storm", "fire the gold double-spend storm"],
                ["POST", "/api/world/market-storm", "independent-trade throughput sweep"],
                ["POST", "/api/world/region", "toggle the settling region"],
              ].map((r) => (
                <div
                  key={r[1]}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "9px 14px",
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: r[0] === "GET" ? C.teal : C.violet,
                      minWidth: 38,
                    }}
                  >
                    {r[0]}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.text, minWidth: 200 }}>
                    {r[1]}
                  </span>
                  <span style={{ fontSize: 13, color: C.muted }}>{r[2]}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="architecture" n="05" kicker="How it fits together" title="Architecture">
            <p style={{ marginTop: 0 }}>
              One truth core, one read plane, one deploy target. The write path is a single atomic
              transaction; the read plane is fed asynchronously and only ever projected, never
              written inside a trade.
            </p>

            <Code>{`  game clients / dupe-attack bots
            │  POST /api/v1/trades  (TradeRequest)
            ▼
   ┌──────────────────────────┐   executeTrade() — one idempotent,
   │      THE TRADE KERNEL     │   atomic, OCC-retrying transaction
   └────────────┬─────────────┘
                │ same txn: item_instances · currency_shards · trades
                │ item_moves · economy_ledger_* · idempotency_registry · event_outbox
                ▼
   ╔════════════════════════╗   outbox    ╔═════════════════════════╗
   ║   AURORA DSQL          ║──projector─▶ ║   DynamoDB              ║
   ║   truth core           ║   (async)   ║   live world read model ║
   ║   Tokyo ⇄ Seoul        ║             ╚═════════════════════════╝
   ║   active-active        ║                        │
   ╚════════════════════════╝                        ▼
            ▲                            world arena + console (Vercel)
   invariant board (live SQL)`}</Code>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
                gap: 16,
                margin: "22px 0",
              }}
            >
              <Panel>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.teal, marginBottom: 8 }}>
                  AURORA DSQL — truth core
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.muted }}>
                  The single source of truth. A multi-region peered cluster is one logical database
                  over two strongly-consistent endpoints (Tokyo primary{" "}
                  <Tok color={C.text}>ap-northeast-1</Tok>, Seoul secondary{" "}
                  <Tok color={C.text}>ap-northeast-2</Tok>). Optimistic concurrency; no foreign keys;{" "}
                  <Tok color={C.text}>CREATE INDEX ASYNC</Tok>; money as BIGINT minor units.
                </p>
              </Panel>
              <Panel>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.violet, marginBottom: 8 }}>
                  DYNAMODB — read model
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.muted }}>
                  The read plane only. Written exclusively by the transactional-outbox projector via
                  idempotent <Tok color={C.text}>PutItem</Tok> — never inside a trade. CQRS: the
                  write model stays minimal and serializable, reads scale out.
                </p>
              </Panel>
              <Panel>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.gold, marginBottom: 8 }}>
                  VERCEL — runtime
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: C.muted }}>
                  Next.js 15 (App Router). Auth is IAM-token based — Vercel OIDC at runtime, the AWS
                  credential chain locally. <span style={{ color: C.text }}>No passwords or secrets
                  in code.</span>
                </p>
              </Panel>
            </div>

            <H3>Exactly-once, end to end</H3>
            <p>
              Two pieces make the write path safe to retry. The{" "}
              <span style={{ color: C.text }}>idempotency registry</span> (keyed{" "}
              <Tok color={C.text}>realm_id, idempotency_key</Tok>) stores the canonical snapshot, so
              a retried or duplicated request replays byte-identically instead of double-applying.
              The <span style={{ color: C.text }}>event outbox</span> is written inside the same
              transaction as the economic change, then drained to DynamoDB by the projector — so the
              read model can never describe a state the truth core didn&apos;t commit.
            </p>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section id="integration" n="06" kicker="Adopting it" title="Integration">
            <p style={{ marginTop: 0 }}>
              Adoption is a single discipline: route <span style={{ color: C.text }}>every</span>{" "}
              economic action through the kernel. A trade, a drop, a pickup, mail, an auction fill,
              a gold transfer — all of them become a <Tok color={C.text}>TradeRequest</Tok> to{" "}
              <Tok color={C.text}>executeTrade</Tok> /{" "}
              <Tok color={C.text}>POST /api/v1/trades</Tok>, each carrying a stable idempotency key.
            </p>

            <ol style={{ paddingLeft: 20, margin: "16px 0", lineHeight: 1.75 }}>
              <li>
                <strong style={{ color: C.text }}>Model your objects in two buckets.</strong> Unique
                items become <Tok color={C.text}>item_instances</Tok> rows; fungible currencies
                become sharded <Tok color={C.text}>currency_shards</Tok> + ledger.
              </li>
              <li>
                <strong style={{ color: C.text }}>Express each action as legs.</strong> Item legs
                carry the <Tok color={C.text}>expectedVersion</Tok> you read; gold legs carry minor
                units. A drop is an item leg to <Tok color={C.text}>WORLD</Tok>; a sale is item legs
                one way and gold legs the other.
              </li>
              <li>
                <strong style={{ color: C.text }}>Derive a deterministic idempotency key</strong>{" "}
                per logical action so client retries, disconnects, and replays settle exactly once.
              </li>
              <li>
                <strong style={{ color: C.text }}>Read from the projection, not the truth core.</strong>{" "}
                Inventories, feeds, and dashboards read DynamoDB; the kernel keeps the write path
                lean.
              </li>
              <li>
                <strong style={{ color: C.text }}>Surface retries, don&apos;t hide them.</strong> Trust{" "}
                <Tok color={C.text}>snapshot.attempts</Tok> and the failure codes as first-class
                outcomes in your client.
              </li>
            </ol>

            <Panel
              style={{
                margin: "24px 0 8px",
                borderColor: `${C.gold}33`,
                background: `${C.gold}0a`,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: ".22em",
                  color: C.gold,
                  marginBottom: 10,
                }}
              >
                THE HONEST CAVEAT
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.62, color: C.text }}>
                The guarantees hold for exactly the actions that pass through the kernel. If a path
                bypasses <Tok color={C.text}>executeTrade</Tok> and mutates ownership or balances
                directly, it bypasses the proof too. Duped makes duplication{" "}
                <span style={{ color: C.teal }}>unrepresentable in the authoritative state</span> —
                so make the kernel the only door into that state.
              </p>
            </Panel>
          </Section>

          <footer
            style={{
              marginTop: 40,
              paddingTop: 24,
              borderTop: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
              DUPED · economy kernel · Aurora DSQL + DynamoDB
            </span>
            <a
              href="/try"
              style={{ fontFamily: MONO, fontSize: 12, color: C.gold, textDecoration: "none" }}
            >
              See it hold at 1 ▸
            </a>
          </footer>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .docs-sidebar { display: none !important; }
          main > div:last-of-type { grid-template-columns: 1fr !important; gap: 0 !important; }
        }
        html { scroll-behavior: smooth; }
      `}</style>
    </main>
  );
}
