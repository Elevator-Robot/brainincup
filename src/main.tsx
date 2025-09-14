import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentUser } from 'aws-amplify/auth';
import App from './App.tsx';
import CustomAuth from './components/CustomAuth.tsx';
import './index.css';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';

console.log('Amplify outputs:', outputs);
Amplify.configure(outputs);

// Add auth event listeners
import { Hub } from 'aws-amplify/utils';

Hub.listen('auth', (data) => {
  console.log('Auth event:', data);
  if (data.payload.event === 'signInWithRedirect_failure') {
    console.error('🚨 OAuth failure details:', data.payload.data);
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
  }, []);

  const checkAuthState = async () => {
    try {
      await getCurrentUser();
      setIsAuthenticated(true);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthWrapper />
  </React.StrictMode>,
)