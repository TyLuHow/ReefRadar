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
        // ReefRadar brand colors
        reef: {
          primary: '#0077B6',
          secondary: '#00B4D8',
          accent: '#90E0EF',
          light: '#CAF0F8',
        },
        status: {
          healthy: '#2ECC71',
          degraded: '#E74C3C',
          'restored-early': '#F39C12',
          'restored-mid': '#3498DB',
        },
        // Ocean depth palette
        abyss: 'var(--abyss)',
        deep: 'var(--deep)',
        mid: 'var(--mid)',
        surface: 'var(--surface)',
        // Bioluminescent accents
        'glow-cyan': 'var(--glow-cyan)',
        'glow-green': 'var(--glow-green)',
        'glow-coral': 'var(--glow-coral)',
        'glow-gold': 'var(--glow-gold)',
        // Health classification (ocean theme)
        'health-healthy': 'var(--healthy)',
        'health-degraded': 'var(--degraded)',
        'health-restored-early': 'var(--restored-early)',
        'health-restored-mid': 'var(--restored-mid)',
        // Text hierarchy
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
        // Spectrogram thermal
        'spec-cold': 'var(--spec-cold)',
        'spec-cool': 'var(--spec-cool)',
        'spec-warm': 'var(--spec-warm)',
        'spec-hot': 'var(--spec-hot)',
        'spec-fire': 'var(--spec-fire)',
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
