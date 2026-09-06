/**
 * Mirrors the theme that used to be declared inline for the Tailwind play CDN.
 * Building it locally removes a runtime dependency on cdn.tailwindcss.com —
 * the page previously rendered completely unstyled whenever that host was
 * unreachable, and generated its stylesheet by scanning the DOM on every load.
 */
export default {
  content: ['./index.html', './App.tsx', './index.tsx', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        neon: {
          purple: '#b026ff',
          cyan: '#00f3ff',
          pink: '#ff00ff',
          dark: '#050505',
          panel: '#111111',
        },
      },
      fontFamily: { mono: ['Courier New', 'monospace'] },
      boxShadow: {
        'glow-purple': '0 0 10px #b026ff, 0 0 20px #b026ff40',
        'glow-cyan': '0 0 10px #00f3ff, 0 0 20px #00f3ff40',
      },
    },
  },
  plugins: [],
};
