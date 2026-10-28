import type { Config } from "tailwindcss";

function tripletVars(prefix: string, shades: string[]): Record<string, string> {
  return Object.fromEntries(
    shades.map((shade) => [shade, `rgb(var(--${prefix}-${shade}) / <alpha-value>)`])
  );
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: tripletVars("ink", ["950", "900", "800", "700", "600", "500", "400", "300", "200", "100", "50"]),
        brand: tripletVars("brand", ["600", "500", "400"]),
        paper: "rgb(var(--paper) / <alpha-value>)"
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
