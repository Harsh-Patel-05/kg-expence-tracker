import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "#F7FAFC"
        },
        card: {
          0: "#FFFFFF",
          1: "#FFFFFF"
        },
        stroke: {
          0: "#E2E8F0",
          1: "rgba(226,232,240,0.85)"
        },
        text: {
          primary: "#1A202C",
          secondary: "#718096"
        },
        primary: {
          DEFAULT: "#2F855A",
          light: "#38A169"
        },
        cta: {
          yellow: "#ECC94B"
        },
        accent: {
          cyan: "#2F855A",
          blue: "#38A169",
          indigo: "#2F855A"
        }
      },
      boxShadow: {
        panel: "0 4px 12px rgba(0,0,0,0.05)",
        neonCyan: "0 0 0 1px rgba(47,133,90,0.18), 0 6px 18px rgba(47,133,90,0.10)",
        neonBlue: "0 0 0 1px rgba(56,161,105,0.16), 0 6px 18px rgba(56,161,105,0.10)"
      }
    }
  },
  plugins: []
} satisfies Config;

