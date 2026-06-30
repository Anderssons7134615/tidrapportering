/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#effaf7',
          100: '#d9f2ec',
          200: '#b7e4da',
          300: '#82cdbf',
          400: '#46ad9d',
          500: '#248c80',
          600: '#1b7169',
          700: '#185c56',
          800: '#174a47',
          900: '#153d3a',
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
        sans: ['Aptos', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
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
