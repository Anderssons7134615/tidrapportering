/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff6ed',
          100: '#ffead8',
          200: '#ffd1ad',
          300: '#f6ad72',
          400: '#ea8242',
          500: '#da6327',
          600: '#bd491d',
          700: '#963817',
          800: '#792f19',
          900: '#642819',
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
        sans: ['"Manrope Variable"', 'Aptos', '"Segoe UI Variable"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 20, 0.04), 0 12px 32px rgba(16, 24, 20, 0.07)',
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
