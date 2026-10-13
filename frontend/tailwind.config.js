/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        forest: "#10382F",
        pine: "#176B50",
        mint: "#B8F2D2",
        ink: "#17231F",
        midnight: "#101C35",
        raised: "#151F32",
        deepsea: "#203F68",
        voltaic: "#52E0C4",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 56, 47, 0.06), 0 4px 16px rgba(16, 56, 47, 0.06)",
        pop: "0 8px 32px rgba(16, 56, 47, 0.16)",
      },
    },
  },
  plugins: [],
};
