/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Terra cotta — main accent. brand-600 is the primary CTA color.
        brand: {
          50:  "#FDF5F0",
          100: "#FAE8DC",
          200: "#F5CDB8",
          300: "#EDAA88",
          400: "#E07F55",
          500: "#D4683B",
          600: "#C4572A",
          700: "#A8431C",
          800: "#8C3418",
          900: "#4F1C0E",
        },
        // Sage green — trust strip, success states
        sage: {
          50:  "#F4F8F5",
          100: "#EBF2EC",
          200: "#C8DEC9",
          300: "#A3C6A5",
          400: "#6B8F71",
          500: "#4E7356",
          600: "#3A5C41",
          700: "#2A4530",
          800: "#1C2F20",
          900: "#101A12",
        },
        // Warm neutrals — backgrounds, borders, text
        warm: {
          50:  "#FAF8F5",
          100: "#F5F1EB",
          200: "#EBE5DA",
          300: "#D9D0C4",
          400: "#C2B8AA",
          500: "#A89E8F",
          600: "#7A6E65",
          700: "#6E6560",
          800: "#524D49",
          900: "#2D2418",
        },
        safety: {
          high:   "#B94C2C",
          medium: "#D4882A",
          low:    "#4A7C59",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans:    ['"Plus Jakarta Sans"', '"Inter"', "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in":    "fadeIn 0.3s ease-in-out",
        "slide-up":   "slideUp 0.4s ease-out",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(16px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [],
};
