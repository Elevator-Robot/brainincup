import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentUser } from 'aws-amplify/auth';
import App from './App';
import CustomAuth from './components/CustomAuth';
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

function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      // For development testing, allow bypass with URL parameter
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('testmode') === 'true') {
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
    checkAuthState();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
        <div className="text-brand-text-primary">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <CustomAuth onAuthSuccess={handleAuthSuccess} />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>,
);
