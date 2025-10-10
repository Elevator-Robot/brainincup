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
            primary: '#0a0f1c',      // Deep midnight blue
            secondary: '#1a1f2e',    // Lighter navy
            tertiary: '#2a2f3e',     // Soft gray-blue
            glass: 'rgba(15, 23, 42, 0.8)', // Glass effect backdrop
          },
          accent: {
            primary: '#667eea',      // Soft blue
            secondary: '#764ba2',    // Purple
            tertiary: '#f093fb',     // Pink gradient end
            hover: '#5a67d8',        // Darker blue for hover
          },
          surface: {
            primary: 'rgba(255, 255, 255, 0.05)',   // Very subtle glass
            secondary: 'rgba(255, 255, 255, 0.08)',  // Slightly more visible
            tertiary: 'rgba(255, 255, 255, 0.12)',   // More prominent
            border: 'rgba(255, 255, 255, 0.1)',      // Border glass effect
            hover: 'rgba(255, 255, 255, 0.15)',      // Hover glass effect
          },
          text: {
            primary: '#f8fafc',      // Near white for primary text
            secondary: '#e2e8f0',    // Softer white for secondary
            muted: '#94a3b8',        // Muted gray for less important text
            accent: '#a78bfa',       // Purple for accent text
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
        'gradient-mesh': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
        'glow': '0 0 20px rgba(102, 126, 234, 0.6)',
        'glow-sm': '0 0 10px rgba(102, 126, 234, 0.4)',
        'glow-lg': '0 0 40px rgba(102, 126, 234, 0.8), 0 0 80px rgba(102, 126, 234, 0.4)',
        'glow-purple': '0 0 30px rgba(118, 75, 162, 0.6), 0 0 60px rgba(118, 75, 162, 0.3)',
        'glow-pink': '0 0 30px rgba(240, 147, 251, 0.6), 0 0 60px rgba(240, 147, 251, 0.3)',
        'neon-blue': '0 0 5px rgba(102, 126, 234, 0.8), 0 0 20px rgba(102, 126, 234, 0.6), 0 0 40px rgba(102, 126, 234, 0.4)',
        'neon-purple': '0 0 5px rgba(118, 75, 162, 0.8), 0 0 20px rgba(118, 75, 162, 0.6), 0 0 40px rgba(118, 75, 162, 0.4)',
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
            boxShadow: '0 0 20px rgba(102, 126, 234, 0.6)',
            filter: 'brightness(1)',
          },
          '50%': { 
            boxShadow: '0 0 40px rgba(102, 126, 234, 0.8), 0 0 80px rgba(102, 126, 234, 0.4)',
            filter: 'brightness(1.2)',
          },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
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
