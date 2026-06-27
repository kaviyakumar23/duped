import type { Config } from "tailwindcss";

/**
 * Duped — design tokens. A deep, cinematic game-economy aesthetic: near-black abyss,
 * aurora teal + violet, and a legendary GOLD accent reserved for the one true item.
 * The palette lives as CSS variables in globals.css; these mirror them for utility use.
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#04050b",
        abyss: "#06070f",
        panel: "#0a0d1a",
        panel2: "#0c1020",
        panel3: "#0e1326",
        hairline: "rgba(126,158,222,0.12)",
        hi: "#eaf1ff",
        mid: "#8d9bc2",
        dim: "#545f80",
        teal: "#2ff0cf",
        "teal-deep": "#14c8b6",
        violet: "#9d80ff",
        "violet-deep": "#7a5cf0",
        gold: "#ffcf63",
        "gold-hot": "#ffe7a8",
        "gold-deep": "#e9a32c",
        rose: "#ff5d7c",
        green: "#46e7a8",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glowTeal: "0 0 22px rgba(47,240,207,0.45)",
        glowGold: "0 0 26px rgba(255,207,99,0.5)",
        glowRose: "0 0 22px rgba(255,93,124,0.45)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 30px 80px -50px rgba(0,0,0,0.9)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "feed-in": {
          "0%": { opacity: "0", transform: "translateX(-10px)", background: "rgba(47,240,207,0.10)" },
          "100%": { opacity: "1", transform: "translateX(0)", background: "transparent" },
        },
        drift: {
          "0%": { transform: "translate3d(-2%,-1%,0) rotate(0deg) scale(1)" },
          "50%": { transform: "translate3d(3%,2%,0) rotate(4deg) scale(1.08)" },
          "100%": { transform: "translate3d(-1%,3%,0) rotate(-3deg) scale(1.04)" },
        },
        pulse: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.4" } },
        "particle-flow": { to: { strokeDashoffset: "-1000" } },
        "count-glow": {
          "0%,100%": { textShadow: "0 0 28px rgba(255,207,99,0.45)" },
          "50%": { textShadow: "0 0 42px rgba(255,207,99,0.62)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "feed-in": "feed-in 0.6s ease-out both",
        drift: "drift 26s ease-in-out infinite alternate",
        pulse: "pulse 1.5s ease-in-out infinite",
        "particle-flow": "particle-flow 8s linear infinite",
        "count-glow": "count-glow 4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
