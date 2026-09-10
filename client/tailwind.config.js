/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // ─────────────────────────────────────────────────────────
      // VAPORWAVE DESIGN TOKENS — single source of truth (Phase 0)
      // Usage: text-neon-cyan, border-neon-magenta, bg-panel, font-heading…
      // ─────────────────────────────────────────────────────────
      colors: {
        void: '#090014', // The void — near-black purple background
        panel: '#1a103c', // Glass panels — semi-transparent deep purple
        chrome: '#E0E0E0', // Chrome text — light silver foreground
        neon: {
          magenta: '#FF00FF', // THE hero color — primary accents
          cyan: '#00FFFF', // links, focus, secondary borders
          orange: '#FF9900', // sunset highlights, attention
        },
        'dim-border': '#2D1B4E', // muted purple — non-interactive borders
      },
      fontFamily: {
        heading: ['Orbitron', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Share Tech Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0,255,255,0.2)',
        'neon-cyan-strong': '0 0 15px #00FFFF',
        'neon-magenta': '0 0 20px #FF00FF',
      },
      keyframes: {
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'boot-reveal': {
          from: { opacity: '0', transform: 'translateY(2px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        blink: 'blink 1.1s step-end infinite',
        'boot-reveal': 'boot-reveal 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
