"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shared top navigation across the landing (/), the guided demo (/try), and the docs (/docs).
 * Sticky, translucent, aurora-themed. Keep it minimal — it's scaffolding, not a feature.
 */
const LINKS: { href: string; label: string }[] = [
  { href: "/try", label: "Live demo" },
  { href: "/docs", label: "Docs" },
];

export default function SiteNav() {
  const path = usePathname();
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(16px)",
        background: "rgba(6,7,11,.72)",
        borderBottom: "1px solid rgba(255,255,255,.07)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "13px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            textDecoration: "none",
            color: "#e8eaf0",
          }}
        >
          <span
            style={{
              width: 9,
              height: 21,
              background: "linear-gradient(180deg,#ffe9b0,#f5c969)",
              boxShadow: "0 0 18px rgba(255,216,122,.8)",
              borderRadius: 2,
              transform: "skewX(-9deg)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "-.02em",
            }}
          >
            DUPED
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8.5,
              letterSpacing: ".26em",
              color: "#6b7186",
              border: "1px solid rgba(255,255,255,.1)",
              padding: "3px 7px",
              borderRadius: 999,
            }}
          >
            ECONOMY KERNEL
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {LINKS.map((l) => {
            const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  letterSpacing: ".02em",
                  textDecoration: "none",
                  color: active ? "#e8eaf0" : "#9aa0b2",
                  padding: "8px 12px",
                  borderRadius: 9,
                  background: active ? "rgba(255,255,255,.06)" : "transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/try"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
              color: "#06070b",
              background: "#e8eaf0",
              border: "1px solid #fff",
              borderRadius: 9,
              padding: "8px 14px",
            }}
          >
            Try it live ▸
          </Link>
        </div>
      </div>
    </nav>
  );
}
