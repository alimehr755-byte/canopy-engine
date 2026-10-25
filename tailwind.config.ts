import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b1220",
          900: "#111b2e",
          800: "#1a2740",
          700: "#253656",
          600: "#33496f",
          500: "#4a628c",
          400: "#7189ad",
          300: "#a2b4cd",
          200: "#cbd6e5",
          100: "#e6ecf4",
          50: "#f3f6fa"
        },
        brand: {
          600: "#c2410c",
          500: "#ea580c",
          400: "#f97316"
        },
        paper: "#fbfaf7"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      boxShadow: {
        paper: "0 1px 2px rgba(15,23,42,0.06), 0 12px 32px -18px rgba(15,23,42,0.35)",
        panel: "0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 40px -24px rgba(2,6,23,0.6)"
      },
      keyframes: {
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.45" }
        }
      },
      animation: {
        "slide-in": "slide-in 180ms ease-out",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
