import type { Config } from 'tailwindcss'

// Proven Realty brand system: deep navy + bright azure blue (from the logo)
// on a soft cream canvas.
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
        azure: {
          100: '#daf1fc',
          200: '#b0e0f8',
          300: '#7cccf1',
          400: '#48b5e9',
          500: '#29a9e0', // the bright blue in the Proven Realty logo
          600: '#1d8bbe',
          700: '#196f97',
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
