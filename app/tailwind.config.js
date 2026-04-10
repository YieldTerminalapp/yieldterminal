/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: { 900: '#0f172a', 800: '#1e293b', 700: '#334155', 600: '#475569' },
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
};
