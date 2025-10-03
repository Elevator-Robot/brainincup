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
    } catch (signInError: unknown) {
      console.log('Sign in error:', signInError);
      const errorName = signInError && typeof signInError === 'object' && 'name' in signInError ? (signInError as { name: string }).name : '';
      const errorMessage = signInError && typeof signInError === 'object' && 'message' in signInError ? (signInError as { message: string }).message : '';
      console.log('Error name:', errorName);
      console.log('Error message:', errorMessage);
      
      // Try to create account for any authentication failure that might be "user not found"
      if (errorName === 'UserNotFoundException' || 
          errorName === 'NotAuthorizedException' ||
          errorMessage?.includes('User does not exist') ||
          errorMessage?.includes('Incorrect username or password')) {
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
        } catch (signUpError: unknown) {
          const signUpErrorMessage = signUpError && typeof signUpError === 'object' && 'message' in signUpError ? (signUpError as { message: string }).message : '';
          setError(signUpErrorMessage || 'Failed to create account');
        }
      } else {
        setError(errorMessage || 'Failed to sign in');
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
    } catch (error: unknown) {
      const errorMessage = error && typeof error === 'object' && 'message' in error ? (error as { message: string }).message : '';
      setError(errorMessage || 'Failed to confirm account');
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

  const handleAppleSignIn = () => {
    signInWithRedirect({ provider: 'Apple' });
  };

  if (needsConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-bg-primary via-brand-bg-secondary to-brand-bg-tertiary p-4">
        <div className="w-full max-w-md p-8 glass rounded-3xl border border-brand-surface-border shadow-glass-lg backdrop-blur-xl animate-scale-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-brand-accent-primary to-brand-accent-secondary rounded-2xl flex items-center justify-center shadow-glow-sm animate-pulse-glow">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-brand-text-primary mb-2">
              Check your email
            </h1>
            <p className="text-brand-text-secondary text-sm">
              We sent a confirmation code to <span className="font-medium text-brand-text-primary">{email}</span>
            </p>
          </div>

          <div className="space-y-5">
            <input
              type="text"
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value)}
              placeholder="Enter confirmation code"
              className="w-full px-5 py-4 glass border border-brand-surface-border rounded-2xl
                text-brand-text-primary placeholder-brand-text-muted text-base text-center tracking-wider
                focus:outline-none focus:border-brand-accent-primary/50 focus:ring-2 focus:ring-brand-accent-primary/20
                transition-all duration-200 backdrop-blur-sm hover:border-brand-surface-hover"
            />

            {error && (
              <div className="p-4 glass rounded-2xl border border-brand-status-error/20 bg-brand-status-error/5 animate-fade-in">
                <p className="text-brand-status-error text-sm text-center">{error}</p>
              </div>
            )}

            <button
              onClick={handleConfirmation}
              disabled={isLoading}
              className="auth-button-primary w-full py-4 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Confirming...</span>
                </div>
              ) : (
                'Confirm'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-bg-primary via-brand-bg-secondary to-brand-bg-tertiary p-4">
      <div className="w-full max-w-md p-8 glass rounded-3xl border border-brand-surface-border shadow-glass-lg backdrop-blur-xl animate-scale-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-mesh rounded-2xl flex items-center justify-center shadow-glow-sm animate-float">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-brand-text-primary mb-2">
            Welcome to Brain in Cup
          </h1>
          <p className="text-brand-text-secondary text-sm">
            Log in or sign up to start your AI conversation
          </p>
        </div>

        <div className="space-y-5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full px-5 py-4 glass border border-brand-surface-border rounded-2xl
              text-brand-text-primary placeholder-brand-text-muted text-base
              focus:outline-none focus:border-brand-accent-primary/50 focus:ring-2 focus:ring-brand-accent-primary/20
              transition-all duration-200 backdrop-blur-sm hover:border-brand-surface-hover"
            onKeyPress={(e) => e.key === 'Enter' && !showPassword && handleEmailContinue()}
          />

          {!showPassword ? (
            <button
              onClick={handleEmailContinue}
              className="auth-button-primary w-full py-4 text-base font-semibold"
            >
              Continue
            </button>
          ) : (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-5 py-4 glass border border-brand-surface-border rounded-2xl
                  text-brand-text-primary placeholder-brand-text-muted text-base
                  focus:outline-none focus:border-brand-accent-primary/50 focus:ring-2 focus:ring-brand-accent-primary/20
                  transition-all duration-200 backdrop-blur-sm hover:border-brand-surface-hover"
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                autoFocus
              />

              <button
                onClick={handleAuth}
                disabled={isLoading}
                className="auth-button-primary w-full py-4 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing in...</span>
                  </div>
                ) : (
                  'Continue'
                )}
              </button>
            </>
          )}

          {error && (
            <div className="p-4 glass rounded-2xl border border-brand-status-error/20 bg-brand-status-error/5 animate-fade-in">
              <p className="text-brand-status-error text-sm text-center">{error}</p>
            </div>
          )}

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-brand-surface-border"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 glass text-brand-text-muted backdrop-blur-sm rounded-lg">OR</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="auth-button w-full bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <button
            onClick={handleFacebookSignIn}
            className="auth-button w-full bg-[#1877F2] text-white border border-[#1877F2] hover:bg-[#166FE5]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook
          </button>

          <button
            onClick={handleAppleSignIn}
            className="auth-button w-full bg-black text-white border border-black hover:bg-gray-900"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Continue with Apple
          </button>
        </div>
      </div>
    </div>
  );
}