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
          50: '#f7f9fb',
          100: '#edf1f5',
          200: '#dce3eb',
          300: '#bcc7d4',
          400: '#8594a6',
          500: '#596779',
          600: '#47566a',
          700: '#344358',
          800: '#253244',
          900: '#192536',
          950: '#101d2d',
        },
      },
      fontFamily: {
        sans: ['Manrope Variable', 'Aptos', '"Segoe UI Variable"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 20, 0.04)',
        premium: '0 22px 70px rgba(13, 18, 16, 0.18)',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
};
