import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        healthy: "#22c55e",
        strained: "#eab308",
        critical: "#ef4444",
      },
    },
  },
  plugins: [],
};

export default config;
