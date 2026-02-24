/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        abyss: '#1a1714',
        depths: '#0f0d0b',
        'bg-surface': '#252220',
        bone: '#e5e1db',
        ochre: '#cd853f',
        'dusty-rose': '#c08081',
        'pale-gold': '#e9dcc9',
        'muted-tan': '#8b7355',
        'warm-gray': '#a8a29e',
        'warm-amber': '#b8860b',
        'glass-bg': 'var(--glass-bg)',
        'glass-hover': 'var(--glass-bg-hover)',
        'glass-active': 'var(--glass-bg-active)',
        'glass-border': 'var(--glass-border)',
        'status-healthy': 'var(--status-healthy)',
        'status-degraded': 'var(--status-degraded)',
        'status-restoring-early': 'var(--status-restoring-early)',
        'status-restoring-mid': 'var(--status-restoring-mid)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', '"Fira Code"', 'monospace'],
      },
      backdropBlur: {
        glass: '16px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'wave': 'wave 2s ease-in-out infinite',
      },
      keyframes: {
        wave: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};
