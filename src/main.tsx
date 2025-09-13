import React from 'react';
import ReactDOM from 'react-dom/client';
import { Authenticator, ThemeProvider, defaultTheme } from '@aws-amplify/ui-react';
import App from './App.tsx';
import './index.css';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';

Amplify.configure(outputs);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

const customTheme = {
  ...defaultTheme,
  name: 'brain-in-cup-theme',
  tokens: {
    ...defaultTheme.tokens,
    colors: {
      ...defaultTheme.tokens.colors,
      background: {
        primary: '#0f172a',
        secondary: '#1e1b4b',
      },
      brand: {
        primary: {
          10: '#f5f3ff',
          20: '#ede9fe',
          40: '#ddd6fe',
          60: '#c4b5fd',
          80: '#a78bfa',
          100: '#8b5cf6',
        },
      },
      border: {
        primary: 'rgba(51, 65, 85, 0.5)',
        secondary: 'rgba(30, 27, 75, 0.5)',
      },
      font: {
        interactive: '#ffffff',
        secondary: '#cbd5e1',
        tertiary: '#94a3b8',
      },
    },
    components: {
      ...defaultTheme.tokens.components,
      authenticator: {
        container: {
          backgroundColor: 'transparent',
          color: 'font.interactive',
        },
        tabs: {
          item: {
            color: 'font.interactive',
            _hover: {
              color: 'brand.primary.80',
            },
            _active: {
              color: 'brand.primary.100',
              borderColor: 'brand.primary.100',
            },
          },
        },
      },
      field: {
        input: {
          color: 'font.interactive',
          borderColor: 'border.primary',
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          _placeholder: {
            color: '#ffffff',
            opacity: 1,
          },
          _focus: {
            borderColor: 'brand.primary.100',
            boxShadow: '0 0 0 2px rgba(139, 92, 246, 0.2)',
          },
          _autofill: {
            backgroundColor: 'rgba(15, 23, 42, 0.8) !important',
            color: '#ffffff !important',
          },
        },
        label: {
          color: '#ffffff',
        },
      },
      button: {
        primary: {
          backgroundColor: 'brand.primary.100',
          _hover: {
            backgroundColor: 'brand.primary.80',
          },
          _focus: {
            backgroundColor: 'brand.primary.80',
          },
        },
      },
      link: {
        color: 'font.interactive',
        _hover: {
          color: 'brand.primary.80',
        },
      },
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={customTheme}>
      <div className="bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark min-h-screen">
        <Authenticator className="flex items-center justify-center caret-white min-h-screen">
          <App />
        </Authenticator>
      </div>
    </ThemeProvider>
  </React.StrictMode>
);
