/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          // Defining the custom deep dark color to match your system theme
          955: '#0b1329', 
        }
      }
    },
  },
  plugins: [],
}