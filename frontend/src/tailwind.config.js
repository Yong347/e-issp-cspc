/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          750: '#243147',
          850: '#151f38',
          950: '#0b1329',
          955: '#080d1e',
        }
      }
    },
  },
  plugins: [],
}
