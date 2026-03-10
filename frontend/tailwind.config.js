/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f3f6ff',
          100: '#e7edff',
          200: '#d2ddff',
          300: '#b3c5fb',
          400: '#8ca4ee',
          500: '#6f86dc',
          600: '#556ac1',
          700: '#4858a0',
          800: '#3f4b82',
          900: '#39426c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 28px rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        xl: '0.85rem',
        '2xl': '1.1rem',
      },
    },
  },
  plugins: [],
};
