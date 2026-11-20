import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Institutional Palette
        slate: {
          950: '#020617', // Deep background
          900: '#0f172a', // Card background
          800: '#1e293b', // Borders
          50: '#f8fafc',  // Primary text
          400: '#94a3b8', // Secondary text
        },
        blue: {
          500: '#3b82f6', // Primary accent (trust, stability)
          600: '#2563eb', // Hover state
          700: '#1d4ed8', // Active state
          950: '#172554', // Deep blue backgrounds
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], // Clean, professional typography
      }
    },
  },
  plugins: [],
};
export default config;
