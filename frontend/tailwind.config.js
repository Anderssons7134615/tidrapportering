/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f3f7ff',
          100: '#e9f0ff',
          200: '#d3e0ff',
          300: '#b3c8ff',
          400: '#87a8ff',
          500: '#5f83f6',
          600: '#3f63dd',
          700: '#3451bb',
          800: '#2f4597',
          900: '#2b3d79',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.06)',
      },
      borderRadius: {
        xl: '0.8rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
};
