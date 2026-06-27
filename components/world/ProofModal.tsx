"use client";

import { useEffect, useState } from "react";
import type { InvariantReport } from "./types";
import { formatInt } from "./format";

/**
 * THE "PROVE IT LIVE" MOMENT. Opening this modal GETs /api/world/proof and renders every invariant
 * with its EXACT SQL (the literal query that ran against Aurora DSQL), the value it returned, and
 * PASS/FAIL. The number here is the same number on the console — same query, one source of truth.
 */
export function ProofModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [report, setReport] = useState<InvariantReport | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState("loading");
    setReport(null);
    (async () => {
      try {
        const res = await fetch("/api/world/proof", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as InvariantReport;
        if (!cancelled) {
          setReport(json);
          setState("idle");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(3,4,9,0.78)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="duped-panel"
        style={{
          width: "min(820px, 100%)",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "duped-modal-in 0.45s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 22px",
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div>
            <div className="kicker" style={{ color: "var(--teal)" }}>
              Live SQL proof
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 5 }}>
              The exact queries, run against Aurora DSQL — now
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {report && (
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  color: report.allPass ? "var(--green)" : "var(--rose)",
                  border: `1px solid ${report.allPass ? "rgba(70,231,168,0.4)" : "rgba(255,93,124,0.4)"}`,
                  borderRadius: 999,
                  padding: "6px 12px",
                }}
              >
                {report.allPass ? "ALL PASS" : "VIOLATION"}
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: "1px solid var(--hairline)",
                background: "transparent",
                color: "var(--text-mid)",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
              aria-label="close"
            >
              ×
            </button>
          </div>
        </div>

        {/* body */}
        <div className="duped-scroll" style={{ overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          {state === "loading" && (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-dim)" }}>
              running queries against the truth core…
            </div>
          )}
          {state === "error" && (
            <div style={{ padding: "40px 0", textAlign: "center", fontFamily: "var(--mono)", fontSize: 12, color: "var(--rose)" }}>
              proof endpoint unreachable — the truth core didn&apos;t answer.
            </div>
          )}
          {state === "idle" &&
            report?.results.map((r) => (
              <div
                key={r.key}
                style={{
                  border: `1px solid ${r.pass ? "var(--hairline)" : "rgba(255,93,124,0.45)"}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--panel-2)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "11px 14px",
                    borderBottom: "1px solid var(--hairline-2)",
                  }}
                >
                  <span style={{ fontSize: 13, color: "var(--text-hi)" }}>{r.label}</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: r.pass ? "var(--green)" : "var(--rose)",
                    }}
                  >
                    {r.pass ? "✓ PASS" : "✕ FAIL"}
                    {r.critical && (
                      <span style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "var(--text-faint)" }}>CRITICAL</span>
                    )}
                  </span>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "12px 14px",
                    fontFamily: "var(--mono)",
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    color: "var(--teal)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "rgba(0,0,0,0.25)",
                  }}
                >
                  {r.sql}
                </pre>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    padding: "10px 14px",
                    borderTop: "1px solid var(--hairline-2)",
                  }}
                >
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
                    returned{" "}
                    <span className="mono" style={{ fontSize: 15, fontWeight: 600, color: r.pass ? "var(--green)" : "var(--rose)" }}>
                      {formatInt(r.value)}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-dim)" }}>
                    expects <span style={{ color: "var(--text-mid)" }}>{r.expected}</span>
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
