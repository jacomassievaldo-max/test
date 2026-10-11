/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#07080c', 900: '#0b0d13', 800: '#10131b', 700: '#171b26', 600: '#222838', 500: '#2e3548' },
        brand: { DEFAULT: '#8b7bff', soft: '#a99dff', deep: '#5b4bd6' },
        mint: { DEFAULT: '#6ee7b7', deep: '#10b981' },
        amber: { DEFAULT: '#fbbf24' },
        danger: '#ff6b81',
      },
      fontFamily: { display: ['"Space Grotesk"', 'system-ui', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 0 0 1px rgba(139,123,255,.35), 0 8px 40px -8px rgba(139,123,255,.35)' },
    },
  },
  plugins: [],
};
