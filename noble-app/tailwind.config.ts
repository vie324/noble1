import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 既存ダッシュボードの高級感ある配色を踏襲
        gold: {
          DEFAULT: "#C9A86A",
          dark: "#A98B4E",
          light: "#E8D8B5",
        },
        ink: "#2A2520",
      },
    },
  },
  plugins: [],
};

export default config;
