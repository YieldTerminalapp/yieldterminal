/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        paper:  '#F5F1EA',
        cream:  '#EDE7DB',
        ink:    '#0E0C0A',
        rule:   '#D9D3C6',
        ash:    '#8A7F6E',
        leaf:   '#1E5A3A',
        rust:   '#C73F1F',
        cobalt: '#1A3B8C',
        amber:  '#B9841C',
      },
      letterSpacing: {
        widest2: '0.22em',
      },
    },
  },
  plugins: [],
};
