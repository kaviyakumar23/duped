"use client";

export interface ToastData {
  id: number;
  tone: "rose" | "gold" | "violet" | "teal";
  title: string;
  lines: { k: string; v: string; good?: boolean }[];
}

const TONE: Record<ToastData["tone"], string> = {
  rose: "var(--rose)",
  gold: "var(--gold)",
  violet: "var(--violet)",
  teal: "var(--teal)",
};

/**
 * Result toast for the demo levers — the storm/gold/failover "what just happened" readout. Fixed
 * bottom-center so it's visible while scrolling. Dismissed by the parent on a timer.
 */
export function Toast({ toast, onClose }: { toast: ToastData | null; onClose: () => void }) {
  if (!toast) return null;
  const color = TONE[toast.tone];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 26,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 80,
        width: "min(420px, calc(100vw - 32px))",
      }}
    >
      <div
        key={toast.id}
        className="duped-panel"
        style={{
          padding: "16px 18px",
          borderLeft: `2px solid ${color}`,
          animation: "duped-toast-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
          background: `radial-gradient(140% 100% at 0% 0%, ${color}22, transparent 60%), linear-gradient(180deg,var(--panel-2),var(--panel))`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "0.06em",
              color,
              fontWeight: 600,
            }}
          >
            {toast.title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
            }}
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px", marginTop: 14 }}>
          {toast.lines.map((l) => (
            <div key={l.k} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                {l.k}
              </span>
              <span
                className="mono"
                style={{ fontSize: 16, fontWeight: 600, color: l.good === false ? "var(--rose)" : l.good ? "var(--green)" : "var(--text-hi)" }}
              >
                {l.v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
