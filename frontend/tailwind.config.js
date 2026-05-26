/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
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
        soft: '0 1px 2px rgba(15, 23, 42, 0.05), 0 14px 34px rgba(15, 23, 42, 0.08)',
        premium: '0 18px 50px rgba(15, 23, 42, 0.12)',
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
      },
    },
  },
  plugins: [],
};
