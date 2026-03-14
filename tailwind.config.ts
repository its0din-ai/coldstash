import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        display: ["Syne", "sans-serif"],
      },
      colors: {
        bg:       "#0c0d0f",
        surface:  "#14161a",
        surface2: "#1c1f26",
        border:   "#2a2d35",
        accent:   "#00b4d8",
        blue:     "#47b8ff",
        muted:    "#5a5f70",
        ink:      "#e8eaf0",
        danger:   "#ff6b6b",
        green:    "#7ec8a4",
        doc:      "#a8d8ea",
        photo:    "#ffb347",
        video:    "#c39bd3",
        audio:    "#7ec8a4",
        archive:  "#f4a460",
        code:     "#79c9f0",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up":  "fadeUp 0.4s ease forwards",
        "slide-in": "slideIn 0.18s ease forwards",
      },
    },
  },
  plugins: [],
};

export default config;
