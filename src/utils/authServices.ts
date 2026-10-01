import { confirmSignUp, resendSignUpCode, signIn, signUp, type SignInInput, type SignInOutput, type ConfirmSignUpInput, type ResendSignUpCodeOutput } from 'aws-amplify/auth';

function errorName(error: unknown) {
  return error instanceof Error ? error.name : '';
}

function authError(error: unknown, fallback: string) {
  const messages: Record<string, string> = {
    NotAuthorizedException: 'Incorrect email or password. Try again or reset your password.',
    UserNotFoundException: 'Incorrect email or password. Try again or create an account.',
    InvalidPasswordException: 'Choose a stronger password that meets the password requirements.',
    CodeMismatchException: 'That code is incorrect. Please check your email and try again.',
    ExpiredCodeException: 'That code has expired. Request a new code and try again.',
    LimitExceededException: 'Too many attempts. Please wait a little and try again.',
    TooManyRequestsException: 'Too many attempts. Please wait a little and try again.',
    NetworkError: 'Unable to connect. Check your connection and try again.',
  };
  return new Error(messages[errorName(error)] || fallback);
}

// All operations use the existing Amplify configuration initialized in main.tsx.
// Sharing pending requests also protects against rapid submissions/remounts.
let pendingSignIn: Promise<SignInOutput> | undefined;
let pendingConfirmation: ReturnType<typeof confirmSignUp> | undefined;
let initialDelivery: { username: string; result: ResendSignUpCodeOutput } | undefined;

export const authServices = {
  handleSignIn({ username: input, password }: SignInInput): Promise<SignInOutput> {
    if (pendingSignIn) return pendingSignIn;
    if (!password) return Promise.reject(new Error('Please enter your password.'));
    const username = input.trim().toLowerCase();
    initialDelivery = undefined;
    const request = (async (): Promise<SignInOutput> => {
      try {
        return await signIn({ username, password });
      } catch (error) {
        if (errorName(error) !== 'UserNotFoundException' && errorName(error) !== 'NotAuthorizedException') {
          throw authError(error, 'Sign-in failed. Please try again.');
        }
        try {
          const result = await signUp({ username, password, options: {
            autoSignIn: true,
            userAttributes: { email: username, nickname: username.split('@')[0] },
          } });
          if (result.isSignUpComplete) return await signIn({ username, password });
          if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
            initialDelivery = { username, result: result.nextStep.codeDeliveryDetails };
          }
          return { isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_UP' } };
        } catch (signUpError) {
          if (errorName(signUpError) === 'UsernameExistsException') {
            throw authError(error, 'Sign-in failed. Please try again.');
          }
          throw authError(signUpError, 'Account creation failed. Please try again.');
        }
      }
    })();
    pendingSignIn = request;
    void request.then(() => { pendingSignIn = undefined; }, () => { pendingSignIn = undefined; });
    return request;
  },
  handleResendSignUpCode({ username: input }: { username: string }) {
    const username = input.trim().toLowerCase();
    // The sign-in actor requests a code when entering confirmation. Sign-up
    // already sent one; reuse that delivery once, then allow explicit resends.
    if (initialDelivery?.username === username) {
      const result = initialDelivery.result;
      initialDelivery = undefined;
      return Promise.resolve(result);
    }
    return resendSignUpCode({ username });
  },
  handleConfirmSignUp(input: ConfirmSignUpInput) {
    if (pendingConfirmation) return pendingConfirmation;
    const code = input.confirmationCode.trim();
    if (!/^\d{6}$/.test(code)) return Promise.reject(new Error('Enter the complete 6-digit confirmation code.'));
    const request = confirmSignUp({ username: input.username.trim().toLowerCase(), confirmationCode: code })
      .catch(error => { throw authError(error, 'We could not verify your account. Please try again.'); });
    pendingConfirmation = request;
    void request.then(() => { pendingConfirmation = undefined; }, () => { pendingConfirmation = undefined; });
    return request;
  },
};
