/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:      '#0a0a0a',
        surface:   '#101010',
        panel:     '#14140b',
        hover:     '#171717',
        active:    '#222222',
        primary:   '#faff69',
        text:      '#e5e3d3',
        secondary: '#c9c8af',
        muted:     '#93927c',
        border:    'rgba(255, 255, 255, 0.08)',
        'good-text': '#22c55e',
        'good-bg':   'rgba(34, 197, 94, 0.10)',
        'warn-text': '#f59e0b',
        'warn-bg':   'rgba(245, 158, 11, 0.10)',
        'bad-text':  '#ffb4ab',
        'bad-bg':    'rgba(239, 68, 68, 0.16)',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
      },
      fontFamily: {
        ui:   ["Inter", "'PingFang SC'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
