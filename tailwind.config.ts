import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Colours come from Tailwind's palette as CSS variables, so the portal can re-theme them
      // (light, dark, accent) in globals.css. The public site keeps the default values.
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], // Clean, professional typography
      }
    },
  },
  plugins: [],
};
export default config;
