/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#effaf7',
          100: '#d7f2ea',
          200: '#afe5d8',
          300: '#7bcfbd',
          400: '#45ad98',
          500: '#278a78',
          600: '#1b7169',
          700: '#185c56',
          800: '#174a47',
          900: '#153e3b',
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
        sans: ['Aptos', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 20, 0.04)',
        premium: '0 22px 70px rgba(13, 18, 16, 0.18)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
};
