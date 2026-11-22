import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12243a',
        muted: '#64748b',
        brand: '#2563eb',
        canvas: '#f4f7fb',
      },
      boxShadow: {
        card: '0 12px 40px rgba(15, 23, 42, 0.07)',
      },
    },
  },
  plugins: [],
};

export default config;
