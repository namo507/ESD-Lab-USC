import type { Config } from "tailwindcss";

/**
 * ESD Lab Tailwind config — warm aesthetic from `ESD Lab Dashboard.html`
 * design package, mapped onto the verbatim tokens in `src/styles/tokens.css`.
 *
 * Naming aligns with the design package palette (sage/ocean/sand/mint), keeps
 * USC garnet/gold as primaries, and adds the glass-panel + breathing-ring
 * keyframes used by the animated DAG.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // USC + design package palette — never override tokens.css definitions
        garnet: {
          DEFAULT: "var(--usc-garnet)",
          600: "var(--usc-garnet-600)",
          800: "var(--usc-garnet-800)",
        },
        gold: {
          DEFAULT: "var(--usc-gold)",
          tint: "var(--usc-gold-tint)",
        },
        sage: {
          DEFAULT: "#5b9577",
          tint: "#eaf0eb",
          ring: "#85a892",
        },
        ocean: {
          DEFAULT: "#6b8bb8",
          tint: "#eaf0f8",
          ring: "#9bb8e0",
        },
        sand: {
          DEFAULT: "#c79026",
          tint: "#fbf6ec",
          ring: "#d4b676",
        },
        mint: {
          DEFAULT: "#5b9577",
          tint: "#e7f1ea",
          ring: "#7dc59a",
        },
        ink: "var(--ink)",
        paper: "var(--paper)",
        slate: {
          900: "var(--slate-900)",
          800: "var(--slate-800)",
          700: "var(--slate-700)",
          600: "var(--slate-600)",
          500: "var(--slate-500)",
          400: "var(--slate-400)",
          300: "var(--slate-300)",
          200: "var(--slate-200)",
          100: "var(--slate-100)",
          75:  "var(--slate-75)",
          50:  "var(--slate-50)",
        },
      },
      fontFamily: {
        serif: ["Source Serif 4", "Charter", "Georgia", "serif"],
        sans:  ["Source Sans 3", "Inter", "system-ui", "sans-serif"],
        mono:  ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        display: ["48px", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
        h1:      ["32px", { lineHeight: "1.18", letterSpacing: "-0.015em" }],
        h2:      ["24px", { lineHeight: "1.18" }],
        h3:      ["19px", { lineHeight: "1.18" }],
        h4:      ["16px", { lineHeight: "1.3" }],
        body:    ["15px", { lineHeight: "1.5" }],
        small:   ["13px", { lineHeight: "1.45" }],
        micro:   ["11px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        DEFAULT: "2px",
        sm: "2px",
        md: "4px",
        lg: "12px",
        xl: "18px",
        "2xl": "24px",
        full: "999px",
      },
      transitionTimingFunction: {
        sharp: "cubic-bezier(0.2, 0, 0, 1)",
        standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        chart: "240ms",
      },
      boxShadow: {
        card: "0 8px 30px rgba(0,0,0,0.04)",
        glass: "0 1px 2px rgba(14,16,19,0.04), 0 4px 16px rgba(14,16,19,0.08)",
        focus: "0 0 0 2px var(--bg-page), 0 0 0 4px var(--usc-gold)",
        garnet: "0 4px 14px rgba(115,0,10,0.25)",
        agentic: "0 12px 40px rgba(28,26,24,0.18)",
      },
      keyframes: {
        "esd-spin":    { to: { transform: "rotate(360deg)" } },
        "esd-blink":   {
          "0%, 50%":      { opacity: "1" },
          "50.01%, 100%": { opacity: "0" },
        },
        "esd-breathe": {
          "0%, 100%": { boxShadow: "0 0 0 4px rgba(115,0,10,0.18)" },
          "50%":      { boxShadow: "0 0 0 8px rgba(115,0,10,0.05)" },
        },
        "esd-flow":    { to: { strokeDashoffset: "-16" } },
      },
      animation: {
        spin:    "esd-spin 0.7s linear infinite",
        blink:   "esd-blink 1s steps(2) infinite",
        breathe: "esd-breathe 1.6s ease-in-out infinite",
        flow:    "esd-flow 1.2s linear infinite",
      },
      backdropBlur: {
        glass: "12px",
      },
    },
  },
  plugins: [],
} satisfies Config;
