/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,css}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: {
            dark: '#0f172a',    // slate-900
            light: '#1e1b4b',   // indigo-950
          },
          accent: {
            primary: '#8b5cf6',   // violet-500
            secondary: '#d946ef', // fuchsia-500
          },
          surface: {
            dark: 'rgba(15, 23, 42, 0.5)',    // slate-900/50
            light: 'rgba(30, 27, 75, 0.5)',   // indigo-950/50
            border: 'rgba(51, 65, 85, 0.5)',  // slate-700/50
          },
          text: {
            primary: '#ffffff',    // white
            secondary: '#cbd5e1',  // slate-300
            muted: '#94a3b8',      // slate-400
          }
        }
      },
      container: {
        center: true,
        padding: '2rem',
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1280px',
          '2xl': '1536px',
        },
      },
    },
  },
  plugins: [],
}
