import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        cream: {
          50: "#fffaf2",
          100: "#fef5e7",
          200: "#fbe9c8",
        },
        ink: {
          900: "#1a1815",
          700: "#46413a",
          500: "#7c736a",
          400: "#a39a90",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,24,18,0.04), 0 4px 16px -8px rgba(28,24,18,0.06)",
        lift: "0 2px 4px rgba(28,24,18,0.04), 0 12px 32px -12px rgba(28,24,18,0.12)",
        glow: "0 8px 32px -8px rgba(234,88,12,0.25)",
      },
      backgroundImage: {
        "paw-pattern":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='%23ea580c' fill-opacity='0.04'><ellipse cx='30' cy='40' rx='5' ry='6'/><ellipse cx='18' cy='30' rx='3' ry='4'/><ellipse cx='42' cy='30' rx='3' ry='4'/><ellipse cx='14' cy='42' rx='3' ry='4'/><ellipse cx='46' cy='42' rx='3' ry='4'/><ellipse cx='90' cy='90' rx='5' ry='6'/><ellipse cx='78' cy='80' rx='3' ry='4'/><ellipse cx='102' cy='80' rx='3' ry='4'/><ellipse cx='74' cy='92' rx='3' ry='4'/><ellipse cx='106' cy='92' rx='3' ry='4'/></g></svg>\")",
        "warm-fade": "linear-gradient(180deg, #fffaf2 0%, #fef5e7 100%)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        wag: {
          "0%, 100%": { transform: "rotate(-6deg)" },
          "50%": { transform: "rotate(6deg)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        wag: "wag 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
