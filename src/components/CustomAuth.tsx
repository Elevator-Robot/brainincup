import { useState } from 'react';
import { signIn, signUp, confirmSignUp, signInWithRedirect } from 'aws-amplify/auth';

interface CustomAuthProps {
  onAuthSuccess: () => void;
}

export default function CustomAuth({ onAuthSuccess }: CustomAuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');

  const handleEmailContinue = async () => {
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setShowPassword(true);
  };

  const handleAuth = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Try sign in first
      await signIn({ username: email, password });
      onAuthSuccess();
    } catch (signInError: any) {
      console.log('Sign in error:', signInError);
      console.log('Error name:', signInError.name);
      console.log('Error message:', signInError.message);
      
      // Try to create account for any authentication failure that might be "user not found"
      if (signInError.name === 'UserNotFoundException' || 
          signInError.name === 'NotAuthorizedException' ||
          signInError.message?.includes('User does not exist') ||
          signInError.message?.includes('Incorrect username or password')) {
        // User doesn't exist, try sign up
        try {
          const result = await signUp({
            username: email,
            password,
            options: {
              userAttributes: {
                email,
                nickname: email.split('@')[0]
              }
            }
          });
          
          if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
            setNeedsConfirmation(true);
          } else {
            onAuthSuccess();
          }
        } catch (signUpError: any) {
          setError(signUpError.message || 'Failed to create account');
        }
      } else {
        setError(signInError.message || 'Failed to sign in');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmation = async () => {
    if (!confirmationCode) {
      setError('Please enter the confirmation code');
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode });
      await signIn({ username: email, password });
      onAuthSuccess();
    } catch (error: any) {
      setError(error.message || 'Failed to confirm account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signInWithRedirect({ provider: 'Google' });
  };

  const handleFacebookSignIn = () => {
    signInWithRedirect({ provider: 'Facebook' });
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
        <div className="w-full max-w-md p-8 bg-brand-surface-dark rounded-2xl border border-brand-surface-border">
          <h1 className="text-2xl font-light text-brand-text-primary text-center mb-8">
            Check your email
          </h1>
          
          <p className="text-brand-text-secondary text-center mb-6">
            We sent a confirmation code to {email}
          </p>

          <div className="space-y-4">
            <input
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="Enter confirmation code"
              className="w-full px-4 py-3 bg-brand-surface-dark border border-brand-surface-border rounded-lg
                text-brand-text-primary placeholder-brand-text-muted
                focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20"
            />

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              onClick={handleConfirmation}
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary
                text-white font-medium rounded-lg transition-all duration-200
                hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Confirming...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-bg-dark via-brand-bg-light to-brand-bg-dark">
      <div className="w-full max-w-md p-8 bg-brand-surface-dark rounded-2xl border border-brand-surface-border">
        <h1 className="text-2xl font-light text-brand-text-primary text-center mb-8">
          Log in or sign up
        </h1>

        <div className="space-y-4">
          <div>
            <label htmlFor="email-input" className="sr-only">Email address</label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-3 bg-brand-surface-dark border border-brand-surface-border rounded-lg
                text-brand-text-primary placeholder-brand-text-muted
                focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20"
              onKeyPress={(e) => e.key === 'Enter' && !showPassword && handleEmailContinue()}
              required
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>

          {!showPassword ? (
            <button
              onClick={handleEmailContinue}
              className="w-full py-3 bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary
                text-white font-medium rounded-lg transition-all duration-200 hover:opacity-90"
            >
              Continue
            </button>
          ) : (
            <>
              <div>
                <label htmlFor="password-input" className="sr-only">Password</label>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 bg-brand-surface-dark border border-brand-surface-border rounded-lg
                    text-brand-text-primary placeholder-brand-text-muted
                    focus:outline-none focus:border-brand-accent-primary focus:ring-2 focus:ring-brand-accent-primary/20"
                  onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                  required
                  aria-describedby={error ? 'auth-error' : undefined}
                />
              </div>

              <button
                onClick={handleAuth}
                disabled={isLoading}
                className="w-full py-3 bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary
                  text-white font-medium rounded-lg transition-all duration-200
                  hover:opacity-90 disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Continue'}
              </button>
            </>
          )}

          {error && (
            <p id="auth-error" className="text-red-400 text-sm text-center" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-surface-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-brand-surface-dark text-brand-text-muted">OR</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full py-3 bg-white text-gray-700 font-medium rounded-lg border border-gray-300
              hover:bg-gray-50 transition-all duration-200 flex items-center justify-center gap-3"
            aria-label="Continue with Google"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleFacebookSignIn}
            className="w-full py-3 bg-[#0f172a] text-white font-medium rounded-lg border border-[#1877F2]
              hover:bg-[#1e293b] transition-all duration-200 flex items-center justify-center gap-3"
            aria-label="Continue with Facebook"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook
          </button>
        </div>
      </div>
    </div>
  );
}