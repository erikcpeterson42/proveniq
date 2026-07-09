import type { Config } from 'tailwindcss'

// Proven Realty brand system: deep navy + warm gold on a soft cream canvas.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f6f3ec', // soft off-white page background
        navy: {
          50: '#eef3f8',
          100: '#d8e3ef',
          200: '#b3c6db',
          300: '#85a1c0',
          400: '#5c7ba0',
          500: '#3f5f83',
          600: '#2c496a',
          700: '#1f3a56',
          800: '#163149',
          900: '#0f2a43',
          950: '#081a2b',
        },
        gold: {
          100: '#f6edd6',
          200: '#ecdcaf',
          300: '#e0c983',
          400: '#d3b45f',
          500: '#c8a24b',
          600: '#a9863a',
          700: '#86692c',
        },
      },
      fontFamily: {
        // Georgia stack — a premium serif for headings, no web-font download.
        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,42,67,0.04), 0 4px 16px rgba(15,42,67,0.06)',
      },
    },
  },
  plugins: [],
}

export default config
