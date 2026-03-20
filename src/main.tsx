import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { getCurrentUser } from 'aws-amplify/auth';
import App from './App';
import CustomAuth from './components/CustomAuth';
import { isTestModeEnabled } from './utils/testMode';
import './index.css';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';

console.log('Amplify outputs (mock):', outputs);
Amplify.configure(outputs);

// Add auth event listeners
import { Hub } from 'aws-amplify/utils';

let authStateCallback: (() => void) | null = null;

Hub.listen('auth', (data) => {
  console.log('Auth event:', data);
  if (data.payload.event === 'signInWithRedirect_failure') {
    console.error('🚨 OAuth failure details:', data.payload.data);
  }
  if (data.payload.event === 'signedIn' && authStateCallback) {
    authStateCallback();
  }
});

// Register service worker for PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
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

// Entry file intentionally hosts auth gate + app mount.
// eslint-disable-next-line react-refresh/only-export-components
function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initialModeTheme, setInitialModeTheme] = useState<'default' | 'game_master'>(() => {
    if (typeof window === 'undefined') return 'default';
    return window.localStorage.getItem('lastPersonalityMode') === 'game_master' ? 'game_master' : 'default';
  });

  useEffect(() => {
    checkAuthState();
    authStateCallback = checkAuthState;
    
    // Handle OAuth redirects
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('code') || urlParams.get('state')) {
        console.log('OAuth callback detected, checking auth state...');
        setTimeout(() => checkAuthState(), 1000); // Give OAuth time to complete
      }
    };
    
    handleOAuthCallback();
    
    return () => {
      authStateCallback = null;
    };
  }, []);

  const checkAuthState = async () => {
    console.log('Checking auth state...');
    try {
      if (isTestModeEnabled()) {
        console.log('✅ Test mode enabled, bypassing auth');
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      const user = await getCurrentUser();
      console.log('✅ User found:', user);
      setIsAuthenticated(true);
    } catch (error) {
      console.log('❌ No user found:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    console.log('Auth success callback triggered');
    setInitialModeTheme(window.localStorage.getItem('lastPersonalityMode') === 'game_master' ? 'game_master' : 'default');
    checkAuthState();
  };

  if (isLoading) {
    return (
      <div className={`retro-rpg-ui ${initialModeTheme === 'game_master' ? 'retro-rpg-ui--gm' : 'retro-rpg-ui--brain'} min-h-screen flex items-center justify-center`}>
        <div className="text-brand-text-primary">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <CustomAuth onAuthSuccess={handleAuthSuccess} />;
  }

  return <App />;
}

interface RootElementWithCache extends HTMLElement {
  __brainInCupRoot?: Root;
}

const rootElement = document.getElementById('root') as RootElementWithCache | null;

if (!rootElement) {
  throw new Error('Root element not found');
}

const root = rootElement.__brainInCupRoot ?? createRoot(rootElement);
rootElement.__brainInCupRoot = root;

root.render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>,
);
