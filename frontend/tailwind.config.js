/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5fd',
          100: '#e4edfc',
          200: '#cbdafa',
          300: '#a8c0ef',
          400: '#7e9ddc',
          500: '#527ac8',
          600: '#3f65bd',
          700: '#3159b8',
          800: '#254690',
          900: '#203967',
        },
        graphite: {
          50: '#f8f9fb',
          100: '#eef1f5',
          200: '#dfe4eb',
          300: '#b8c2d0',
          400: '#8693a5',
          500: '#657080',
          600: '#536072',
          700: '#414e60',
          800: '#303b4b',
          900: '#26303e',
          950: '#202938',
        },
      },
      fontFamily: {
        sans: ['Geist', '"Segoe UI"', 'system-ui', 'sans-serif'],
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
