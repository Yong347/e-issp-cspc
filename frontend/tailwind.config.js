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
        slate: {
          // Custom deep dark color matching your system's design requirements
          955: '#0b1329', 
        }
      }
    },
  },
  plugins: [],
}