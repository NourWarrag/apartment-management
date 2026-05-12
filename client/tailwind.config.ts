import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#b45309',
          dark: '#92400e',
          darker: '#78350f',
        },
        surface: '#fffbf5',
      },
    },
  },
  plugins: [],
} satisfies Config;
