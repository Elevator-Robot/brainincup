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
            dark: 'rgba(15, 23, 42, 0.8)',    // slate-900/80 - More opaque
            light: 'rgba(30, 27, 75, 0.8)',   // indigo-950/80 - More opaque  
            border: 'rgba(148, 163, 184, 0.3)',  // slate-400/30 - Lighter border
          },
          text: {
            primary: '#ffffff',    // white - WCAG AAA compliant
            secondary: '#e2e8f0',  // slate-200 - Better contrast
            muted: '#cbd5e1',      // slate-300 - Improved readability
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
