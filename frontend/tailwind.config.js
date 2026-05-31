/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f4f5ff',
          100: '#e9ebff',
          200: '#d6daff',
          300: '#b8c0ff',
          400: '#8f99ff',
          500: '#5e6ad2',
          600: '#4f5bbc',
          700: '#414a9a',
          800: '#343b78',
          900: '#252b5c',
        },
        graphite: {
          50: '#f7f7f5',
          100: '#eeeeea',
          200: '#d9d9d2',
          300: '#b7b8ad',
          400: '#8b8e82',
          500: '#696d62',
          600: '#51564e',
          700: '#3d423d',
          800: '#282d2b',
          900: '#171b1a',
          950: '#0b0f0e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 24px rgba(15, 23, 42, 0.06)',
        premium: '0 18px 44px rgba(8, 9, 10, 0.16)',
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
      },
    },
  },
  plugins: [],
};
