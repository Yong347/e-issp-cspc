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
          light: '#edf3fa', // Replaces blinding pure white background with soft tinted slate-blue
          card: '#f7fafc',   // Soft, low-contrast tinted surface for cards and panels
          well: '#e4ecf7',   // Recessed background for inputs, search wells, and nested containers
          border: '#cbd8e6', // Subtle slate-blue border tone to soften high-contrast outlines
        },
        slate: {
          750: '#243147', // Intermediate slate for subtle hover states and card accents
          850: '#151f38', // Border and divide contrast tone for dark mode data tables
          950: '#0b1329', // Deep dark surface tone matching system architecture
          955: '#080d1e', // Ultra-deep dark surface tone for nested input wells and terminal cards
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