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
        // Enhanced color palette for modern glass morphism design
        brand: {
          bg: {
            primary: '#080c1c',
            secondary: '#141a34',
            tertiary: '#252b49',
            glass: 'rgba(13, 18, 40, 0.85)',
          },
          accent: {
            primary: '#7ae8f4',      // Brain cyan
            secondary: '#bda5ff',    // Nebula violet
            tertiary: '#d3bfff',
            hover: '#a5f3fc',
          },
          surface: {
            primary: 'rgba(15, 20, 44, 0.65)',
            secondary: 'rgba(25, 32, 62, 0.7)',
            tertiary: 'rgba(42, 49, 84, 0.8)',
            elevated: '#171d38',
            dark: '#0b1024',
            border: 'rgba(181, 192, 236, 0.22)',
            hover: 'rgba(127, 139, 212, 0.18)',
          },
          text: {
            primary: '#f4f7ff',
            secondary: '#d6def3',
            muted: '#a4b0cf',
            accent: '#7ae8f4',
          },
          status: {
            success: '#10b981',      // Green
            warning: '#f59e0b',      // Amber
            error: '#ef4444',        // Red
            info: '#3b82f6',         // Blue
          }
        }
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #7ae8f4 0%, #bda5ff 100%)',
        'gradient-mesh-alt': 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)'
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
        'glass-sm': '0 4px 16px 0 rgba(31, 38, 135, 0.25)',
        'glass-lg': '0 16px 64px 0 rgba(31, 38, 135, 0.45)',
        'glow': '0 0 20px rgba(121, 215, 194, 0.45)',
        'glow-sm': '0 0 10px rgba(121, 215, 194, 0.35)',
        'glow-lg': '0 0 40px rgba(121, 215, 194, 0.6), 0 0 80px rgba(121, 215, 194, 0.3)',
        'glow-purple': '0 0 30px rgba(68, 189, 162, 0.45), 0 0 60px rgba(68, 189, 162, 0.25)',
        'glow-pink': '0 0 30px rgba(240, 147, 251, 0.6), 0 0 60px rgba(240, 147, 251, 0.3)',
        'neon-blue': '0 0 5px rgba(121, 215, 194, 0.55), 0 0 20px rgba(121, 215, 194, 0.4), 0 0 40px rgba(121, 215, 194, 0.25)',
        'neon-purple': '0 0 5px rgba(68, 189, 162, 0.55), 0 0 20px rgba(68, 189, 162, 0.4), 0 0 40px rgba(68, 189, 162, 0.25)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'slide-down': 'slide-down 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'bounce-subtle': 'bounce-subtle 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'wiggle': 'wiggle 1s ease-in-out infinite',
        'text-populate': 'text-populate 0.5s ease-out both',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-glow': {
          '0%, 100%': { 
            opacity: 1,
            transform: 'scale(1)',
          },
          '50%': { 
            opacity: 0.8,
            transform: 'scale(1.05)',
          },
        },
        'slide-up': {
          '0%': { 
            opacity: 0,
            transform: 'translateY(20px)' 
          },
          '100%': { 
            opacity: 1,
            transform: 'translateY(0)' 
          },
        },
        'slide-down': {
          '0%': { 
            opacity: 0,
            transform: 'translateY(-20px)' 
          },
          '100%': { 
            opacity: 1,
            transform: 'translateY(0)' 
          },
        },
        'fade-in': {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        'scale-in': {
          '0%': { 
            opacity: 0,
            transform: 'scale(0.95)' 
          },
          '100%': { 
            opacity: 1,
            transform: 'scale(1)' 
          },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%, 100%': { 
            boxShadow: '0 0 20px rgba(121, 215, 194, 0.45)',
            filter: 'brightness(1)',
          },
          '50%': { 
            boxShadow: '0 0 40px rgba(121, 215, 194, 0.6), 0 0 80px rgba(121, 215, 194, 0.3)',
            filter: 'brightness(1.2)',
          },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'text-populate': {
          '0%': {
            opacity: 0,
            transform: 'translateY(4px)',
            filter: 'blur(3px)',
          },
          '60%': {
            filter: 'blur(0px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
            filter: 'blur(0)',
          },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      container: {
        center: true,
        padding: '1rem',
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1280px',
          '2xl': '1400px',
        },
      },
    },
  },
  plugins: [],
}
