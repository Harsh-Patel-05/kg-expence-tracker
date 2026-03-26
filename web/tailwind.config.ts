import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "#0B1220",
          1: "#0A1020",
          2: "#0F172A"
        },
        card: {
          0: "rgba(255,255,255,0.05)",
          1: "rgba(255,255,255,0.08)"
        },
        stroke: {
          0: "rgba(148,163,184,0.18)",
          1: "rgba(34,211,238,0.22)"
        },
        accent: {
          cyan: "#22D3EE",
          blue: "#60A5FA",
          indigo: "#6366F1"
        }
      },
      boxShadow: {
        panel: "0 10px 30px rgba(0,0,0,0.35)",
        neonCyan: "0 0 0 1px rgba(34,211,238,0.18), 0 0 24px rgba(34,211,238,0.14)",
        neonBlue: "0 0 0 1px rgba(96,165,250,0.16), 0 0 24px rgba(96,165,250,0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;

