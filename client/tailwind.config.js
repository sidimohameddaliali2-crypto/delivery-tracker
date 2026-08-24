/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Matter Brand Guidelines (2025-04-07) — used by the Customer
        // Management / Subscription & Sales / Customer Analytics pages.
        matter: {
          sky: "#4d9eff",       // Pantone 2727 C — primary: buttons, logo, headings
          green: "#bcf679",     // Pantone 916 C — primary: positive/active accents
          navy: "#051747",      // Pantone 282 C — primary: dark text on light bg
          blueblack: "#050f2b", // primary: darkest
          charcoal: "#302e2e",  // secondary: dark neutral
          dust: "#e3d1c2",      // secondary: warm neutral tint
          backdrop: "#ede5de",  // secondary: warm neutral bg tint
          dustedblue: "#a8ccf5",// tertiary accent — use sparingly
          purple: "#c994ff",    // tertiary accent — use sparingly
          red: "#ff3b00",       // tertiary accent — use sparingly, danger/urgent

          // Weekly Menu (menu-selection page) tonal ramps — ported verbatim
          // from the Design canvas file's :root tokens (Sky Blue / Green /
          // Navy re-expressed as full 100-900 ramps), not re-derived.
          accent: {
            100: "#eef5ff",
            200: "#d9eaff",
            300: "#b8d9ff",
            400: "#85bfff",
            500: "#4d9eff",
            600: "#2b7fe0",
            700: "#1b60b4",
            800: "#143f7a",
            900: "#051747",
          },
          accent2: {
            100: "#f6fde9",
            200: "#eafbd0",
            300: "#ddf7b0",
            400: "#cff98c",
            500: "#bcf679",
            600: "#9dd456",
            700: "#6f9c30",
            800: "#47661d",
            900: "#2a3f13",
          },
          neutral: {
            100: "#f7f9fd",
            200: "#eef2f9",
            300: "#dde4f0",
            400: "#b9c4da",
            500: "#8e9bb8",
            600: "#6b7a9b",
            700: "#4a5a7d",
            800: "#1e3260",
            900: "#050f2b",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}