import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { 0: "#F4F5F7", 1: "#F8F9FB" },
        card: { 0: "#FFFFFF", 1: "#FFFFFF" },
        stroke: { 0: "#E6E8EE", 1: "#D8DBE3" },
        text: { primary: "#111827", secondary: "#4B5563", muted: "#6B7280" },
        primary: { DEFAULT: "#E56B2C", hover: "#CF5A1F", light: "#FFF1E8" },
        accent: { DEFAULT: "#9A3F24", cyan: "#E56B2C", blue: "#CF5A1F", indigo: "#9A3F24" },
        cta: { yellow: "#F2A65A" },
        success: { DEFAULT: "#059669", bg: "#ECFDF5" },
        danger: { DEFAULT: "#DC2626", bg: "#FEF2F2" },
        warning: { DEFAULT: "#D97706", bg: "#FFFBEB" }
      },
      boxShadow: {
        panel: "0 1px 2px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.04)",
        float: "0 8px 24px rgba(17,24,39,0.08)",
        neonCyan: "0 6px 16px rgba(229,107,44,0.28)",
        neonBlue: "0 6px 16px rgba(154,63,36,0.18)"
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
