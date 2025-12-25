/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Futuristic dark grey and green color scheme
        cyber: {
          black: '#0a0a0a',
          dark: '#0d1210',
          gray: {
            50: '#0f1412',
            100: '#121715',
            200: '#16201c',
            300: '#1a2923',
            400: '#1f3329',
            500: '#243d30',
            600: '#294837',
            700: '#2e533e',
            800: '#335f46',
            900: '#396b4f',
          },
          green: {
            50: '#0a1f14',
            100: '#0d2a1b',
            200: '#103823',
            300: '#14492e',
            400: '#175b38',
            500: '#1a6e42',
            600: '#1d824d',
            700: '#219958',
            800: '#26b263',
            900: '#39ca6f',
            950: '#4cd87b',
            glow: '#5ae885',
            bright: '#6fff96',
          },
          accent: {
            dim: '#1a4a32',
            DEFAULT: '#22cc66',
            bright: '#44dd88',
          },
        },
      },
      boxShadow: {
        'cyber': '0 0 20px rgba(34, 204, 102, 0.15)',
        'cyber-glow': '0 0 30px rgba(34, 204, 102, 0.3)',
        'cyber-sm': '0 0 10px rgba(34, 204, 102, 0.1)',
        'panel': '0 4px 20px rgba(0, 0, 0, 0.5)',
      },
      borderColor: {
        'cyber': 'rgba(34, 204, 102, 0.3)',
        'cyber-dim': 'rgba(34, 204, 102, 0.15)',
      },
    },
  },
  plugins: [],
}