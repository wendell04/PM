/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: '#0f0f0f',
          'black-soft': '#1a1a1a',
          red: '#c41e3a',
          'red-dark': '#a01830',
          gold: '#d4a843',
          'gold-light': '#e8c76a',
          'gold-dark': '#b8922f',
        },
      },
      fontFamily: {
        heading: ['Outfit', 'system-ui', 'sans-serif'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
