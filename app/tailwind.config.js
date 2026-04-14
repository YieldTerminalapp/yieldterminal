/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Martian Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        onyx:     '#000000',
        coal:     '#0C0C0C',
        graphite: '#151515',
        steel:    '#242424',
        silver:   '#F5F5F5',
        smoke:    '#6B6B6B',
        acid:     '#D4FF00',
        blood:    '#FF3B30',
        hazard:   '#FFB800',
        cobalt:   '#3B82F6',
      },
      letterSpacing: {
        widest2: '0.22em',
        widest3: '0.32em',
      },
    },
  },
  plugins: [],
};
