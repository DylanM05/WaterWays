/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary-colour)',
          dark: 'var(--secondary-colour)',
          hover: 'var(--hover-colour)',
        },
        background: {
          DEFAULT: 'var(--background-colour)',
          card: 'var(--card-bg-colour)',
        },
        text: {
          DEFAULT: 'var(--text-colour)',
          primary: 'var(--primary-text-colour)',
        },
        border: 'var(--border-colour)',
        button: 'var(--button-bg)',
        chart: 'var(--chart-bg)',
      }
    },
  },
  plugins: [],
}