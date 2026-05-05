import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#F5F6F8",
          100: "#E7EAEF",
          200: "#C9CFD9",
          300: "#A4ADBD",
          400: "#7A8499",
          500: "#566077",
          600: "#3E4659",
          700: "#2B3142",
          800: "#1C212E",
          900: "#11151E",
          950: "#0A0D14",
        },
        navy: {
          50: "#EAF0F9",
          100: "#CFDCEE",
          200: "#9FB7DA",
          300: "#6E91C5",
          400: "#456FAE",
          500: "#2A538E",
          600: "#1F3F6E",
          700: "#172F52",
          800: "#10213A",
          900: "#0A1628",
          950: "#060E1A",
        },
        gold: {
          50: "#FAF6EC",
          100: "#F1E7C7",
          200: "#E2CD8B",
          300: "#D2B45A",
          400: "#B8973A",
          500: "#947629",
          600: "#6F591E",
          700: "#4F3F15",
          800: "#33290D",
        },
        slatey: {
          50: "#F7F8FA",
          100: "#EEF0F4",
          200: "#D9DEE7",
          300: "#B5BDCD",
          400: "#8A95AC",
          500: "#647088",
          600: "#4A546A",
          700: "#353C4D",
          800: "#222836",
          900: "#141823",
        },
        positive: {
          50: "#EFF8F1",
          500: "#2E7D4F",
          600: "#226039",
        },
        negative: {
          50: "#FBEFEF",
          500: "#9B2C2C",
          600: "#7A2222",
        },
        warning: {
          50: "#FBF5E8",
          500: "#A07815",
          600: "#7B5B0F",
        },
        canvas: "#F7F7F4",
        paper: "#FFFFFF",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        serif: ["Georgia", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.04em" }],
      },
      letterSpacing: {
        wider: "0.06em",
        widest: "0.14em",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(16,33,58,0.04), 0 1px 2px rgba(16,33,58,0.06)",
        elevated:
          "0 1px 0 rgba(16,33,58,0.04), 0 8px 24px -8px rgba(16,33,58,0.18)",
        focus: "0 0 0 3px rgba(42,83,142,0.18)",
      },
    },
  },
  plugins: [],
};
export default config;
