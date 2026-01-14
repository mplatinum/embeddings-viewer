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
          black: '#05070d',
          dark: '#0b1220',
          gray: {
            50: '#0d1521',
            100: '#111b2a',
            200: '#142235',
            300: '#182a40',
            400: '#1d324d',
            500: '#233b5a',
            600: '#2a4568',
            700: '#325076',
            800: '#3b5c85',
            900: '#456a95',
          },
          green: {
            50: '#0c2b26',
            100: '#12362f',
            200: '#184239',
            300: '#1f4f44',
            400: '#265c50',
            500: '#2d6a5c',
            600: '#357a6b',
            700: '#3d8a7b',
            800: '#47a18f',
            900: '#5fc6b2',
            950: '#7be3cc',
            glow: '#9df3d7',
            bright: '#d2fff0',
          },
          accent: {
            dim: '#4a3213',
            DEFAULT: '#f9c74f',
            bright: '#ffd166',
          },
        },
      },
      boxShadow: {
        'cyber': '0 0 20px rgba(95, 198, 178, 0.18)',
        'cyber-glow': '0 0 30px rgba(249, 199, 79, 0.25)',
        'cyber-sm': '0 0 10px rgba(61, 138, 123, 0.35)',
        'panel': '0 4px 20px rgba(0, 0, 0, 0.5)',
      },
      borderColor: {
        'cyber': 'rgba(249, 199, 79, 0.45)',
        'cyber-dim': 'rgba(95, 198, 178, 0.25)',
      },
    },
  },
  plugins: [],
}
