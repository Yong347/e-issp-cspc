// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enables manual class-based light/dark mode toggling
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Calming Soft Slate & Subdued Ice-Blue Palette (Eye-Friendly Light Mode)
        canvas: {
          light: '#edf3fa', // Soft tinted slate-blue background
          card: '#f7fafc',   // Low-contrast tinted surface for cards and panels
          well: '#e4ecf7',   // Recessed background for inputs, search wells, and nested containers
          border: '#cbd8e6', // Subtle slate-blue border tone
        },
        slate: {
          750: '#243147', // Intermediate slate for subtle hover states and card accents
          850: '#151f38', // Border and divide contrast tone for dark mode data tables
          950: '#0b1329', // Deep dark surface tone matching system architecture
          955: '#080d1e', // Ultra-deep dark surface tone for nested input wells and terminal cards
        },
        // Custom ultra-dark 955 tinted shades to prevent Tailwind from dropping dark:bg-*-955 classes
        blue: {
          955: '#07152e', // Deep midnight navy for nested callouts and active filters
        },
        amber: {
          955: '#221505', // Deep dark amber for warning panels and caution cards
        },
        rose: {
          955: '#23070f', // Deep dark crimson for error alerts and review returns
        },
        emerald: {
          955: '#041d14', // Deep dark forest green for success banners and approval states
        },
        purple: {
          955: '#180728', // Deep dark violet for projects, PMF, and department tags
        },
        teal: {
          955: '#041c19', // Deep dark teal for Section 8.0 needs indicators
        }
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.18s ease-out forwards',
      },
    },
  },
  plugins: [],
}